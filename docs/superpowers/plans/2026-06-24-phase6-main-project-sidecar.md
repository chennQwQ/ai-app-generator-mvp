# Phase 6 Main Project Sidecar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the tracked `ai-app-generator-mvp` work needed to run a long-lived ApiFlow sidecar service and connect the web/API product to it without committing ApiFlow source.

**Architecture:** The main repository owns the product control plane: React UI, Fastify API, SQLite persistence, WebSocket fan-out, Java sidecar wrapper, and repository boundary checks. `apps/apiflow-sidecar` is a long-running Java HTTP service that imports ApiFlow from outside the repository through `APIFLOW_SOURCE_DIR` or `mavenLocal`; it is not a copy of ApiFlow. The TypeScript API calls the sidecar over HTTP and remains the owner of projects, workflow records, local run IDs, and browser events.

**Tech Stack:** TypeScript, Fastify, SQLite, Vitest, React, Java 17, Gradle, Jackson, ApiFlow external dependency.

---

## Process Topology

Run Phase 6 locally as four processes:

```text
apps/web dev server
  -> apps/api Fastify server
     -> apps/apiflow-sidecar Java service on http://127.0.0.1:9527
        -> external 20250725_apiFlow apiFlow-core FlowEngine
     -> opencode process for project generation tasks
```

The sidecar is a service process, not just a compile-time jar dependency.

Before running commands that reference `$COURSE_ROOT`, set it from the main worktree:

```powershell
$COURSE_ROOT = (Resolve-Path "..\..\..").Path
```

## Repository Boundary

Main repo may track:

- `apps/apiflow-sidecar/**`
- `apps/api/**`
- `apps/web/**`
- `packages/shared/**`
- `scripts/**`
- `docs/**`

Main repo must not track:

- `20250725_apiFlow/**`
- `apiFlow-core/**`
- `apiFlow-control/**`
- `apiFlow-spring/**`
- copied source from `org.apiFlow/**`

---

## Task 1: Add Repository Boundary Guards

**Files:**
- Modify: `.gitignore`
- Create: `scripts/check-no-apiflow-source.mjs`
- Create: `scripts/install-git-hooks.ps1`
- Modify: `package.json`
- Test: run `npm.cmd run check:repo-boundary`

- [ ] **Step 1: Extend `.gitignore`**

Append:

```gitignore
# External/private ApiFlow source must stay outside this repository.
20250725_apiFlow/
apiFlow/
apiFlow-core/
apiFlow-control/
apiFlow-spring/
vendor/apiFlow/
vendor/apiFlow-core/
third_party/apiFlow/
third_party/apiFlow-core/
apps/apiflow-sidecar/apiFlow-core/
apps/apiflow-sidecar/external/
apps/apiflow-sidecar/vendor/
```

- [ ] **Step 2: Create staged-file guard**

Create `scripts/check-no-apiflow-source.mjs`:

```js
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const staged = execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean);

const forbiddenPathPatterns = [
  /(^|\/)20250725_apiFlow\//,
  /(^|\/)apiFlow-core\//,
  /(^|\/)apiFlow-control\//,
  /(^|\/)apiFlow-spring\//,
  /(^|\/)vendor\/apiFlow/i,
  /(^|\/)third_party\/apiFlow/i,
  /^apps\/apiflow-sidecar\/apiFlow-core\//,
  /^apps\/apiflow-sidecar\/vendor\//,
  /^apps\/apiflow-sidecar\/external\//
];

const forbiddenContentMarkers = [
  "package org.apiFlow.core;",
  "public class FlowEngine",
  "public abstract class AbstractScript extends Script",
  "org.apiFlow.core.task"
];

const blocked = [];

for (const file of staged) {
  if (forbiddenPathPatterns.some((pattern) => pattern.test(file))) {
    blocked.push(`${file}: forbidden ApiFlow source path`);
    continue;
  }

  if (!existsSync(file)) continue;
  if (!/\.(java|groovy)$/.test(file)) continue;

  const content = readFileSync(file, "utf8");
  const marker = forbiddenContentMarkers.find((value) => content.includes(value));
  if (marker && !file.startsWith("apps/apiflow-sidecar/runtime/src/main/java/com/aigenerator/apiflow/")) {
    blocked.push(`${file}: suspicious ApiFlow source marker "${marker}"`);
  }
}

if (blocked.length > 0) {
  console.error("Blocked commit: ApiFlow source must not be tracked by ai-app-generator-mvp.");
  for (const item of blocked) console.error(`- ${item}`);
  process.exit(1);
}

console.log("Repository boundary check passed.");
```

- [ ] **Step 3: Add local hook installer**

Create `scripts/install-git-hooks.ps1`:

```powershell
$ErrorActionPreference = "Stop"
$repoRoot = git rev-parse --show-toplevel
$hookPath = Join-Path $repoRoot ".git/hooks/pre-push"
@'
#!/bin/sh
npm run check:repo-boundary
'@ | Set-Content -NoNewline -Encoding ascii $hookPath
Write-Host "Installed pre-push hook: $hookPath"
```

- [ ] **Step 4: Add scripts to `package.json`**

Add these scripts while preserving existing scripts:

```json
{
  "check:repo-boundary": "node scripts/check-no-apiflow-source.mjs",
  "hooks:install": "powershell -ExecutionPolicy Bypass -File scripts/install-git-hooks.ps1"
}
```

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm.cmd run check:repo-boundary
git status --short
```

Expected:

```text
Repository boundary check passed.
```

Commit:

```powershell
git add .gitignore package.json scripts/check-no-apiflow-source.mjs scripts/install-git-hooks.ps1
git commit -m "chore: guard apiflow source boundary"
```

---

## Task 2: Create Long-Running Java Sidecar Skeleton

**Files:**
- Create: `apps/apiflow-sidecar/settings.gradle`
- Create: `apps/apiflow-sidecar/build.gradle`
- Create: `apps/apiflow-sidecar/runtime/build.gradle`
- Create: `apps/apiflow-sidecar/runtime/src/main/java/com/aigenerator/apiflow/SidecarMain.java`
- Create: `apps/apiflow-sidecar/runtime/src/test/java/com/aigenerator/apiflow/SidecarMainTest.java`
- Modify: `package.json`

- [ ] **Step 1: Add Gradle settings**

Create `apps/apiflow-sidecar/settings.gradle`:

```gradle
pluginManagement {
    repositories {
        gradlePluginPortal()
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        mavenLocal()
        mavenCentral()
    }
}

rootProject.name = "ai-app-generator-apiflow-sidecar"
include "runtime"

def apiFlowSourceDir = System.getenv("APIFLOW_SOURCE_DIR")
if (apiFlowSourceDir != null && apiFlowSourceDir.trim().length() > 0) {
    includeBuild(apiFlowSourceDir) {
        dependencySubstitution {
            substitute module("cn.coderead:apiFlow-core") using project(":apiFlow-core")
        }
    }
}
```

- [ ] **Step 2: Add sidecar build files**

Create `apps/apiflow-sidecar/build.gradle`:

```gradle
plugins {
    id "java"
}

allprojects {
    group = "com.aigenerator"
    version = "0.1.0"
}

subprojects {
    apply plugin: "java"

    java {
        toolchain {
            languageVersion = JavaLanguageVersion.of(17)
        }
    }

    test {
        useJUnitPlatform()
    }
}
```

Create `apps/apiflow-sidecar/runtime/build.gradle`:

```gradle
plugins {
    id "application"
}

dependencies {
    implementation "cn.coderead:apiFlow-core:1.0-SNAPSHOT"
    implementation "com.fasterxml.jackson.core:jackson-databind:2.17.2"
    testImplementation "org.junit.jupiter:junit-jupiter:5.10.3"
}

application {
    mainClass = "com.aigenerator.apiflow.SidecarMain"
}
```

- [ ] **Step 3: Implement health-only server**

Create `apps/apiflow-sidecar/runtime/src/main/java/com/aigenerator/apiflow/SidecarMain.java`:

```java
package com.aigenerator.apiflow;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;

public final class SidecarMain {
    private static final ObjectMapper JSON = new ObjectMapper();

    private SidecarMain() {}

    public static void main(String[] args) throws Exception {
        int port = Integer.parseInt(System.getenv().getOrDefault("APIFLOW_SIDECAR_PORT", "9527"));
        HttpServer server = createServer(port);
        server.start();
        System.out.printf("ApiFlow sidecar listening on http://127.0.0.1:%d%n", port);
    }

    static HttpServer createServer(int port) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        server.createContext("/api/apiflow/health", SidecarMain::health);
        return server;
    }

    private static void health(HttpExchange exchange) throws IOException {
        byte[] body = JSON.writeValueAsBytes(Map.of("ok", true, "service", "apiflow-sidecar"));
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(200, body.length);
        exchange.getResponseBody().write(body);
        exchange.close();
    }

    static String healthJson() {
        return "{\"ok\":true,\"service\":\"apiflow-sidecar\"}";
    }
}
```

- [ ] **Step 4: Add smoke test**

Create `apps/apiflow-sidecar/runtime/src/test/java/com/aigenerator/apiflow/SidecarMainTest.java`:

```java
package com.aigenerator.apiflow;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class SidecarMainTest {
    @Test
    void healthJsonIsStable() {
        assertEquals("{\"ok\":true,\"service\":\"apiflow-sidecar\"}", SidecarMain.healthJson());
    }
}
```

- [ ] **Step 5: Add package scripts**

Add scripts to root `package.json`:

```json
{
  "dev:apiflow": "gradle -p apps/apiflow-sidecar :runtime:run",
  "test:apiflow": "gradle -p apps/apiflow-sidecar :runtime:test"
}
```

- [ ] **Step 6: Verify and commit**

Run:

```powershell
$env:APIFLOW_SOURCE_DIR = "$COURSE_ROOT\20250725_apiFlow"
npm.cmd run test:apiflow
```

Expected: Gradle test task passes.

Commit:

```powershell
git add package.json apps/apiflow-sidecar
git commit -m "feat: add apiflow sidecar service skeleton"
```

---

## Task 3: Implement Sidecar Run Control Plane

**Files:**
- Create: `apps/apiflow-sidecar/runtime/src/main/java/com/aigenerator/apiflow/ApiFlowDtos.java`
- Create: `apps/apiflow-sidecar/runtime/src/main/java/com/aigenerator/apiflow/ApiFlowRuntimeService.java`
- Modify: `apps/apiflow-sidecar/runtime/src/main/java/com/aigenerator/apiflow/SidecarMain.java`
- Create: `apps/apiflow-sidecar/runtime/src/test/java/com/aigenerator/apiflow/ApiFlowRuntimeServiceTest.java`

- [ ] **Step 1: Define sidecar DTO contract**

Create `ApiFlowDtos.java`:

```java
package com.aigenerator.apiflow;

import java.util.List;
import java.util.Map;

public final class ApiFlowDtos {
    private ApiFlowDtos() {}

    public static final class StartRunRequest {
        public String workflowId;
        public String workflowName;
        public String dsl;
        public Map<String, Object> input;
    }

    public static final class RunResponse {
        public String externalRunId;
        public String workflowId;
        public String status;
        public Object result;
        public String error;
        public String startedAt;
        public String finishedAt;
        public String createdAt;
    }

    public static final class RunEvent {
        public long sequence;
        public String externalRunId;
        public String type;
        public String nodeId;
        public String status;
        public String message;
        public String createdAt;
    }

    public static final class RunEventsResponse {
        public List<RunEvent> events;
    }
}
```

- [ ] **Step 2: Add real runtime service**

Create `ApiFlowRuntimeService.java` with these public methods:

```java
public ApiFlowDtos.RunResponse startRun(ApiFlowDtos.StartRunRequest request) throws Exception
public ApiFlowDtos.RunResponse getRun(String externalRunId)
public void cancelRun(String externalRunId)
public List<ApiFlowDtos.RunEvent> getEvents(String externalRunId, long afterSequence)
```

Implementation requirements:

- Generate IDs like `apiflow-<uuid>`.
- Write DSL to `<runtimeRoot>/workflows/<workflowId>/api/main.groovy`.
- Construct `new FlowEngine(new URL[]{workflowRoot.toUri().toURL()})`.
- Call `engine.reLoad()`.
- Call `engine.execute("main.groovy", request.input == null ? Map.of() : request.input)`.
- Store statuses `queued`, `running`, `succeeded`, `failed`, `cancelled`.
- Append events for `run.queued`, `run.running`, `run.succeeded`, `run.failed`, `run.cancelled`.

- [ ] **Step 3: Add run endpoints**

Modify `SidecarMain.java` to expose:

```text
GET  /api/apiflow/health
POST /api/apiflow/workflows/{workflowId}/runs
GET  /api/apiflow/runs/{externalRunId}
POST /api/apiflow/runs/{externalRunId}/cancel
GET  /api/apiflow/runs/{externalRunId}/events?after=<sequence>
```

Response rules:

- `POST /runs` returns `202`.
- `GET /runs/:id` returns `404` when run is unknown.
- `POST /cancel` returns `204`.
- Errors return JSON `{ "message": "..." }`.

- [ ] **Step 4: Test real FlowEngine execution**

Create `ApiFlowRuntimeServiceTest.java`:

```java
package com.aigenerator.apiflow;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class ApiFlowRuntimeServiceTest {
    @Test
    void executesDslThroughExternalApiFlowCore() throws Exception {
        ApiFlowRuntimeService service = new ApiFlowRuntimeService(Files.createTempDirectory("apiflow-runtime-"));

        ApiFlowDtos.StartRunRequest request = new ApiFlowDtos.StartRunRequest();
        request.workflowId = "wf-real";
        request.workflowName = "Real WF";
        request.dsl = """
            task_get_token = EVAL {
                "token-" + input.name
            }

            start {
                run task_get_token
            }
            """;
        request.input = Map.of("name", "luban");

        ApiFlowDtos.RunResponse started = service.startRun(request);
        assertNotNull(started.externalRunId);

        ApiFlowDtos.RunResponse finished = waitForTerminal(service, started.externalRunId);
        assertEquals("succeeded", finished.status);
        assertEquals("token-luban", finished.result);
    }

    private static ApiFlowDtos.RunResponse waitForTerminal(ApiFlowRuntimeService service, String runId) throws Exception {
        long deadline = System.currentTimeMillis() + 5000;
        ApiFlowDtos.RunResponse run = service.getRun(runId);
        while (!run.status.equals("succeeded") && !run.status.equals("failed") && System.currentTimeMillis() < deadline) {
            Thread.sleep(25);
            run = service.getRun(runId);
        }
        return run;
    }
}
```

- [ ] **Step 5: Verify and commit**

Run:

```powershell
$env:APIFLOW_SOURCE_DIR = "$COURSE_ROOT\20250725_apiFlow"
npm.cmd run test:apiflow
```

Commit:

```powershell
git add apps/apiflow-sidecar
git commit -m "feat: run apiflow workflows from sidecar"
```

---

## Task 4: Connect Fastify API To Sidecar Contract

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/api/src/apiflow/apiflow-http-adapter.ts`
- Modify: `apps/api/src/apiflow/apiflow-bridge.ts`
- Modify: `apps/api/src/db/schema.ts`
- Modify: `apps/api/test/workflows.test.ts`

- [ ] **Step 1: Extend shared ApiFlow types**

Add:

```ts
export interface ApiFlowRunEvent {
  sequence: number;
  externalRunId: string;
  type: "run.queued" | "run.running" | "run.succeeded" | "run.failed" | "run.cancelled" | "task.started" | "task.succeeded" | "task.failed" | "task.logged";
  nodeId: string | null;
  status: string | null;
  message: string | null;
  createdAt: string;
}
```

- [ ] **Step 2: Update `HttpApiFlowRuntimeAdapter.startRun()`**

Change request body to:

```ts
{
  workflowId: input.workflowId,
  workflowName: input.workflowName,
  dsl: exported.dsl,
  input: {}
}
```

Accept response:

```ts
{
  externalRunId: string;
  workflowId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  result: unknown | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}
```

Stop expecting `{ runId: string }`.

- [ ] **Step 3: Add mock sidecar test**

In `apps/api/test/workflows.test.ts`, add a local HTTP server test for `WORKFLOW_RUNTIME=apiflow-http` that asserts:

```ts
expect(runRes.statusCode).toBe(202);
expect(runRes.json().runtime).toBe("apiflow");
expect(runRes.json().externalRunId).toBe("apiflow-test-run-1");
expect(sidecar.requests[0].body.workflowId).toBe(workflow.id);
expect(sidecar.requests[0].body.dsl).toContain("EVAL");
```

- [ ] **Step 4: Persist external event stream later, keep polling now**

Keep `ApiFlowBridge` polling `getRun()` in this task. Do not introduce a new SQLite event table until external ApiFlow task events exist. The sidecar can expose `/events`, but the API bridge only needs run-level polling for the first real interaction.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm.cmd run test --workspace apps/api -- apps/api/test/workflows.test.ts
npm.cmd run typecheck --workspace apps/api
```

Commit:

```powershell
git add packages/shared/src/index.ts apps/api/src/apiflow apps/api/test/workflows.test.ts
git commit -m "feat: connect api to apiflow sidecar contract"
```

---

## Task 5: Wire UI States For Real Sidecar Runs

**Files:**
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/components/WorkflowCanvas.tsx`
- Modify: `apps/web/src/components/WorkflowList.tsx`
- Modify: `apps/web/src/App.test.tsx`

- [ ] **Step 1: Confirm current run UI still works**

Run:

```powershell
npm.cmd run test --workspace apps/web
```

Expected: existing tests pass before changes.

- [ ] **Step 2: Display external run IDs only in developer-oriented areas**

Add run detail fields to the existing run/history UI:

```ts
externalRunId: run.externalRunId ?? null
runtime: run.runtime
```

Do not expose ApiFlow implementation details in the primary user prompt panel.

- [ ] **Step 3: Update WebSocket handling**

Ensure existing `workflow.run.status` events update:

```ts
run.status
run.startedAt
run.finishedAt
run.externalRunId
```

Keep node-level status hidden until the external ApiFlow source plan adds task events.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm.cmd run test --workspace apps/web
npm.cmd run typecheck --workspace apps/web
```

Commit:

```powershell
git add apps/web
git commit -m "feat: show real apiflow run status"
```

---

## Task 6: Document Main Repo Runtime Commands

**Files:**
- Modify: `docs/local-development.md`
- Modify: `docs/development-standards.md`
- Modify: `docs/phase-roadmap.md`

- [ ] **Step 1: Add four-process startup commands**

Document:

```powershell
$env:APIFLOW_SOURCE_DIR = "$COURSE_ROOT\20250725_apiFlow"
$env:APIFLOW_SIDECAR_PORT = "9527"
npm.cmd run dev:apiflow

$env:WORKFLOW_RUNTIME = "apiflow-http"
$env:APIFLOW_SIDECAR_URL = "http://127.0.0.1:9527"
$env:AGENT_PROVIDER = "opencode"
npm.cmd run dev:api

npm.cmd run dev:web
```

- [ ] **Step 2: Add source ownership rule**

Document:

```text
Sidecar service code belongs to ai-app-generator-mvp.
ApiFlow engine source changes belong to `$COURSE_ROOT\20250725_apiFlow`.
No ApiFlow source is copied into ai-app-generator-mvp.
```

- [ ] **Step 3: Commit**

```powershell
git add docs/local-development.md docs/development-standards.md docs/phase-roadmap.md
git commit -m "docs: document apiflow sidecar runtime"
```

---

## Self-Review

- This plan treats ApiFlow as a long-lived service process.
- The sidecar service wrapper is tracked in the main repo.
- ApiFlow source remains external and is never copied into the main repo.
- The first vertical slice supports run-level status before task-level events.
- The plan leaves engine instrumentation to `2026-06-24-phase6-apiflow-source-extension.md`.
