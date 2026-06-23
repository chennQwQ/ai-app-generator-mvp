# Real ApiFlow Isolated Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the local `D:\doc\code\apiFlow项目课程\20250725_apiFlow` source as the real ApiFlow runtime while keeping all ApiFlow source code outside the `ai-app-generator-mvp` Git repository and impossible to accidentally push to the remote.

**Architecture:** The main Studio repository owns TypeScript API, React UI, sidecar wrapper code, adapter contracts, tests, docs, and Git safety checks. The ApiFlow source stays as a sibling local repository and is consumed through `APIFLOW_SOURCE_DIR`, Gradle composite build, or `mavenLocal`; no `apiFlow-core` source files are copied into the Studio repository. Runtime execution uses a Java sidecar wrapper in the Studio repo that depends on external ApiFlow artifacts/classes.

**Tech Stack:** TypeScript, Fastify, React Flow, SQLite, Vitest, Java, Gradle, `20250725_apiFlow`, Groovy, local Maven/Gradle composite builds.

---

## Non-Negotiable Repository Boundary

- Do not copy `20250725_apiFlow/apiFlow-core/src/**` into `ai-app-generator-mvp`.
- Do not add `20250725_apiFlow` as a Git submodule.
- Do not add ApiFlow source files under `apps/`, `packages/`, `vendor/`, `third_party/`, or any tracked path in `ai-app-generator-mvp`.
- Main repo may contain sidecar wrapper code under `apps/apiflow-sidecar`, but that wrapper must depend on ApiFlow externally.
- Main repo tests must pass without the private ApiFlow source by skipping real sidecar tests unless `APIFLOW_SOURCE_DIR` or a local Maven artifact is available.
- Local developer machines may use `D:\doc\code\apiFlow项目课程\20250725_apiFlow`.
- Remote CI must not require or expose `20250725_apiFlow`.

## Current ApiFlow Baseline

Use `D:\doc\code\apiFlow项目课程\20250725_apiFlow` as the baseline, not `一、引擎的使用指南\apiFlow`.

Important improvements in `20250725_apiFlow`:

- Has Gradle wrapper files.
- Adds `apiFlow-core/src/main/java/org/apiFlow/core/DslCompiler.java`.
- `FlowEngine` uses DSL package rewriting with `dslRootPackageName` and `dslHome`.
- `FlowEngine` adds `getFlowPath(Class<? extends AbstractScript>)`.
- `App` initialization accepts `Map<String, ?> appConfig`.
- `HTTP("url")` shortcut is improved via `quickInitialization`.

Still missing for product parity:

- REST runtime control plane.
- Stable external run IDs.
- Structured run and task events.
- Cancellation token checked by tasks.
- Groovy DSL to visual graph import.
- Node-level status streaming for the screenshot-like UI.

## Dependency Strategy

Use two supported local dependency modes.

### Mode A: Maven Local Artifact

Best for stable development and safest for Git:

1. Build/publish ApiFlow from the external repo:

```powershell
cd D:\doc\code\apiFlow项目课程\20250725_apiFlow
.\gradlew.bat :apiFlow-core:publishToMavenLocal
```

2. Main repo sidecar depends on:

```gradle
implementation "cn.coderead:apiFlow-core:1.0-SNAPSHOT"
```

3. Main repo includes `mavenLocal()` in the sidecar Gradle repositories.

### Mode B: Local Composite Build

Best when actively changing ApiFlow:

1. Set:

```powershell
$env:APIFLOW_SOURCE_DIR = "D:\doc\code\apiFlow项目课程\20250725_apiFlow"
```

2. `apps/apiflow-sidecar/settings.gradle` uses `includeBuild(System.getenv("APIFLOW_SOURCE_DIR"))` only when the variable is present.

3. Main repo still tracks no ApiFlow source.

## File Structure

### Main Repo Files To Create Or Modify

- Modify: `.gitignore`
  Add explicit ignore entries for accidental ApiFlow copies.

- Create: `scripts/check-no-apiflow-source.mjs`
  Fails if staged files include ApiFlow source paths or known ApiFlow source markers.

- Create: `scripts/install-git-hooks.ps1`
  Installs a local `pre-push` hook that runs `npm.cmd run check:repo-boundary`.

- Modify: `package.json`
  Add `check:repo-boundary`, `dev:apiflow`, and `test:apiflow` scripts.

- Create: `apps/apiflow-sidecar/settings.gradle`
  Gradle build that optionally uses `APIFLOW_SOURCE_DIR` as composite build.

- Create: `apps/apiflow-sidecar/build.gradle`
  Wrapper build settings for sidecar modules.

- Create: `apps/apiflow-sidecar/runtime/build.gradle`
  Java app module depending on external `apiFlow-core`.

- Create: `apps/apiflow-sidecar/runtime/src/main/java/com/aigenerator/apiflow/SidecarMain.java`
  Starts HTTP control plane.

- Create: `apps/apiflow-sidecar/runtime/src/main/java/com/aigenerator/apiflow/ApiFlowRuntimeService.java`
  Wraps `FlowEngine` and manages run registry.

- Create: `apps/apiflow-sidecar/runtime/src/main/java/com/aigenerator/apiflow/ApiFlowDtos.java`
  Sidecar DTOs.

- Create: `apps/apiflow-sidecar/runtime/src/test/java/com/aigenerator/apiflow/ApiFlowRuntimeServiceTest.java`
  Tests real ApiFlow execution, skipped when ApiFlow dependency is unavailable.

- Modify: `apps/api/src/apiflow/apiflow-http-adapter.ts`
  Align request/response contract with sidecar.

- Modify: `apps/api/test/workflows.test.ts`
  Add contract tests using a local mock sidecar server.

- Modify: `docs/local-development.md`
  Explain local ApiFlow setup and source isolation.

- Modify: `docs/development-standards.md`
  Add copyright/source-boundary rule.

- Modify: `docs/phase-roadmap.md`
  Update Phase 6 status once Slice A is implemented.

### External Files Not Tracked By Main Repo

- `D:\doc\code\apiFlow项目课程\20250725_apiFlow\**`
  Treated as external/private source.

- `~\.m2\repository\cn\coderead\apiFlow-core\1.0-SNAPSHOT\**`
  Local build artifact cache.

- Main repo `.env` or PowerShell environment:

```powershell
APIFLOW_SOURCE_DIR=D:\doc\code\apiFlow项目课程\20250725_apiFlow
APIFLOW_SIDECAR_URL=http://127.0.0.1:9527
WORKFLOW_RUNTIME=apiflow-http
```

---

## Task 1: Add Repository Boundary Guards

**Files:**
- Modify: `.gitignore`
- Create: `scripts/check-no-apiflow-source.mjs`
- Create: `scripts/install-git-hooks.ps1`
- Modify: `package.json`

- [ ] **Step 1: Add explicit ignore entries**

Modify `.gitignore`:

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

- [ ] **Step 2: Add boundary check script**

Create `scripts/check-no-apiflow-source.mjs`:

```js
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

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
  "interface App",
  "org.apiFlow.core.task"
];

const blocked = [];

for (const file of staged) {
  if (forbiddenPathPatterns.some((pattern) => pattern.test(file))) {
    blocked.push(`${file}: forbidden ApiFlow source path`);
    continue;
  }

  if (!existsSync(file)) continue;
  if (!/\.(java|groovy|gradle|md|txt|ts|tsx|js|mjs)$/.test(file)) continue;

  const content = readFileSync(file, "utf8");
  const marker = forbiddenContentMarkers.find((value) => content.includes(value));
  if (marker && file.startsWith("apps/apiflow-sidecar/") && !file.includes("com/aigenerator/apiflow")) {
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

- [ ] **Step 3: Add hook installer**

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

- [ ] **Step 4: Add package scripts**

Modify `package.json`:

```json
{
  "scripts": {
    "check:repo-boundary": "node scripts/check-no-apiflow-source.mjs",
    "hooks:install": "powershell -ExecutionPolicy Bypass -File scripts/install-git-hooks.ps1"
  }
}
```

Keep existing scripts.

- [ ] **Step 5: Verify boundary script**

Run:

```powershell
npm.cmd run check:repo-boundary
```

Expected:

```text
Repository boundary check passed.
```

- [ ] **Step 6: Commit**

```powershell
git add .gitignore package.json scripts/check-no-apiflow-source.mjs scripts/install-git-hooks.ps1
git commit -m "chore: guard apiflow source boundary"
```

---

## Task 2: Create Sidecar Wrapper Without ApiFlow Source

**Files:**
- Create: `apps/apiflow-sidecar/settings.gradle`
- Create: `apps/apiflow-sidecar/build.gradle`
- Create: `apps/apiflow-sidecar/runtime/build.gradle`
- Create: `apps/apiflow-sidecar/runtime/src/main/java/com/aigenerator/apiflow/SidecarMain.java`
- Create: `apps/apiflow-sidecar/runtime/src/test/java/com/aigenerator/apiflow/SidecarMainTest.java`
- Modify: `package.json`

- [ ] **Step 1: Add Gradle settings with optional external ApiFlow**

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

- [ ] **Step 3: Add sidecar smoke entry**

Create `apps/apiflow-sidecar/runtime/src/main/java/com/aigenerator/apiflow/SidecarMain.java`:

```java
package com.aigenerator.apiflow;

public final class SidecarMain {
    private SidecarMain() {}

    public static void main(String[] args) {
        System.out.println("ApiFlow sidecar wrapper ready.");
    }

    static String healthJson() {
        return "{\"ok\":true}";
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
    void returnsHealthJson() {
        assertEquals("{\"ok\":true}", SidecarMain.healthJson());
    }
}
```

- [ ] **Step 5: Add scripts**

Modify `package.json`:

```json
{
  "scripts": {
    "dev:apiflow": "gradle -p apps/apiflow-sidecar :runtime:run",
    "test:apiflow": "gradle -p apps/apiflow-sidecar :runtime:test"
  }
}
```

Keep existing scripts.

- [ ] **Step 6: Verify without committing ApiFlow source**

First publish ApiFlow locally or use composite build.

Maven local mode:

```powershell
cd D:\doc\code\apiFlow项目课程\20250725_apiFlow
.\gradlew.bat :apiFlow-core:publishToMavenLocal
cd D:\doc\code\apiFlow项目课程\ai-app-generator-mvp\.worktrees\implement-mvp
npm.cmd run test:apiflow
```

Composite mode:

```powershell
$env:APIFLOW_SOURCE_DIR = "D:\doc\code\apiFlow项目课程\20250725_apiFlow"
npm.cmd run test:apiflow
```

Expected: sidecar smoke tests pass. `git status --short` must not show any ApiFlow source files.

- [ ] **Step 7: Commit**

```powershell
git add package.json apps/apiflow-sidecar
git commit -m "feat: add isolated apiflow sidecar wrapper"
```

---

## Task 3: Implement Real Sidecar Control Plane

**Files:**
- Create: `apps/apiflow-sidecar/runtime/src/main/java/com/aigenerator/apiflow/ApiFlowDtos.java`
- Create: `apps/apiflow-sidecar/runtime/src/main/java/com/aigenerator/apiflow/ApiFlowRuntimeService.java`
- Modify: `apps/apiflow-sidecar/runtime/src/main/java/com/aigenerator/apiflow/SidecarMain.java`
- Test: `apps/apiflow-sidecar/runtime/src/test/java/com/aigenerator/apiflow/ApiFlowRuntimeServiceTest.java`

- [ ] **Step 1: Write real FlowEngine test**

Create `apps/apiflow-sidecar/runtime/src/test/java/com/aigenerator/apiflow/ApiFlowRuntimeServiceTest.java`:

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
        request.dsl = """
            init {
                listen webhook on "/execute"
            }

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

- [ ] **Step 2: Run test and confirm it fails before implementation**

```powershell
$env:APIFLOW_SOURCE_DIR = "D:\doc\code\apiFlow项目课程\20250725_apiFlow"
npm.cmd run test:apiflow -- --tests com.aigenerator.apiflow.ApiFlowRuntimeServiceTest
```

Expected: FAIL because DTO/service do not exist.

- [ ] **Step 3: Add DTOs**

Create `apps/apiflow-sidecar/runtime/src/main/java/com/aigenerator/apiflow/ApiFlowDtos.java`:

```java
package com.aigenerator.apiflow;

import java.util.Map;

public final class ApiFlowDtos {
    private ApiFlowDtos() {}

    public static final class StartRunRequest {
        public String workflowId;
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
}
```

- [ ] **Step 4: Add runtime service**

Create `apps/apiflow-sidecar/runtime/src/main/java/com/aigenerator/apiflow/ApiFlowRuntimeService.java`:

```java
package com.aigenerator.apiflow;

import org.apiFlow.core.FlowEngine;

import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class ApiFlowRuntimeService {
    private final Path runtimeRoot;
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final Map<String, ApiFlowDtos.RunResponse> runs = new ConcurrentHashMap<>();

    public ApiFlowRuntimeService(Path runtimeRoot) {
        this.runtimeRoot = runtimeRoot;
    }

    public ApiFlowDtos.RunResponse startRun(ApiFlowDtos.StartRunRequest request) throws Exception {
        String runId = "apiflow-" + UUID.randomUUID();
        ApiFlowDtos.RunResponse run = new ApiFlowDtos.RunResponse();
        run.externalRunId = runId;
        run.workflowId = request.workflowId;
        run.status = "queued";
        run.createdAt = Instant.now().toString();
        runs.put(runId, run);
        executor.submit(() -> executeRun(run, request));
        return run;
    }

    public ApiFlowDtos.RunResponse getRun(String externalRunId) {
        ApiFlowDtos.RunResponse run = runs.get(externalRunId);
        if (run == null) throw new IllegalArgumentException("ApiFlow run not found: " + externalRunId);
        return run;
    }

    public void cancelRun(String externalRunId) {
        ApiFlowDtos.RunResponse run = getRun(externalRunId);
        if (run.status.equals("queued") || run.status.equals("running")) {
            run.status = "cancelled";
            run.finishedAt = Instant.now().toString();
        }
    }

    private void executeRun(ApiFlowDtos.RunResponse run, ApiFlowDtos.StartRunRequest request) {
        try {
            if (run.status.equals("cancelled")) return;
            run.status = "running";
            run.startedAt = Instant.now().toString();

            Path workflowRoot = runtimeRoot.resolve("workflows").resolve(request.workflowId);
            Path apiDir = Files.createDirectories(workflowRoot.resolve("api"));
            String flowFile = "main.groovy";
            Files.writeString(apiDir.resolve(flowFile), request.dsl);

            FlowEngine engine = new FlowEngine(new URL[]{workflowRoot.toUri().toURL()});
            engine.reLoad();
            Object result = engine.execute(flowFile, request.input == null ? Map.of() : request.input);

            if (!run.status.equals("cancelled")) {
                run.result = result;
                run.status = "succeeded";
                run.finishedAt = Instant.now().toString();
            }
        } catch (Exception error) {
            run.status = "failed";
            run.error = error.getMessage();
            run.finishedAt = Instant.now().toString();
        }
    }
}
```

- [ ] **Step 5: Run sidecar tests**

```powershell
$env:APIFLOW_SOURCE_DIR = "D:\doc\code\apiFlow项目课程\20250725_apiFlow"
npm.cmd run test:apiflow
```

Expected: PASS.

- [ ] **Step 6: Add HTTP endpoints**

Modify `SidecarMain.java` to expose:

- `GET /api/apiflow/health`
- `POST /api/apiflow/workflows/{workflowId}/runs`
- `GET /api/apiflow/runs/{externalRunId}`
- `POST /api/apiflow/runs/{externalRunId}/cancel`

Use `com.sun.net.httpserver.HttpServer` and Jackson. Keep JSON parsing and response writing in private helper methods.

- [ ] **Step 7: Commit**

```powershell
git add apps/apiflow-sidecar
git commit -m "feat: execute real apiflow from isolated sidecar"
```

---

## Task 4: Connect TypeScript API To Sidecar

**Files:**
- Modify: `apps/api/src/apiflow/apiflow-http-adapter.ts`
- Modify: `apps/api/test/workflows.test.ts`

- [ ] **Step 1: Add mock-sidecar contract test**

Add a test in `apps/api/test/workflows.test.ts` proving that `WORKFLOW_RUNTIME=apiflow-http` posts generated DSL to `/api/apiflow/workflows/:id/runs` and persists `externalRunId`.

The test should assert:

```ts
expect(runRes.statusCode).toBe(202);
expect(runRes.json().runtime).toBe("apiflow");
expect(runRes.json().externalRunId).toBe("apiflow-test-run-1");
expect(sidecar.requests[0].body.dsl).toContain("EVAL");
```

- [ ] **Step 2: Update adapter request shape**

Modify `HttpApiFlowRuntimeAdapter.startRun()` to send:

```ts
{
  workflowId: input.workflowId,
  workflowName: input.workflowName,
  dsl: exported.dsl,
  input: {}
}
```

Map sidecar response to `ApiFlowExternalRun`.

- [ ] **Step 3: Run API tests**

```powershell
npm.cmd run test --workspace apps/api -- apps/api/test/workflows.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add apps/api/src/apiflow/apiflow-http-adapter.ts apps/api/test/workflows.test.ts
git commit -m "feat: connect api to isolated apiflow sidecar"
```

---

## Task 5: Add Real ApiFlow Local Development Docs

**Files:**
- Modify: `docs/local-development.md`
- Modify: `docs/development-standards.md`
- Modify: `docs/phase-roadmap.md`

- [ ] **Step 1: Document ApiFlow source boundary**

Add to `docs/development-standards.md`:

```markdown
## ApiFlow Source Boundary

`D:\doc\code\apiFlow项目课程\20250725_apiFlow` is an external local source tree. It must not be copied into, committed from, or pushed through `ai-app-generator-mvp`.

Allowed:
- refer to it with `APIFLOW_SOURCE_DIR`
- publish `apiFlow-core` to `mavenLocal`
- run sidecar tests locally

Forbidden:
- vendoring `apiFlow-core/src/**`
- adding ApiFlow as a submodule
- committing generated copies under `apps/apiflow-sidecar`
```

- [ ] **Step 2: Document local run commands**

Add to `docs/local-development.md`:

```powershell
cd D:\doc\code\apiFlow项目课程\20250725_apiFlow
.\gradlew.bat :apiFlow-core:publishToMavenLocal

cd D:\doc\code\apiFlow项目课程\ai-app-generator-mvp\.worktrees\implement-mvp
$env:APIFLOW_SOURCE_DIR = "D:\doc\code\apiFlow项目课程\20250725_apiFlow"
npm.cmd run dev:apiflow

$env:WORKFLOW_RUNTIME = "apiflow-http"
$env:APIFLOW_SIDECAR_URL = "http://127.0.0.1:9527"
npm.cmd run dev:api

npm.cmd run dev:web
```

- [ ] **Step 3: Verify boundary before commit**

```powershell
npm.cmd run check:repo-boundary
git status --short
```

Expected: no ApiFlow source paths appear.

- [ ] **Step 4: Commit**

```powershell
git add docs/local-development.md docs/development-standards.md docs/phase-roadmap.md
git commit -m "docs: document isolated apiflow development"
```

---

## Task 6: Plan ApiFlow Core Extensions In External Repo

**Files in external repo only:**
- `D:\doc\code\apiFlow项目课程\20250725_apiFlow\apiFlow-core\src\main\java\org\apiFlow\core\ExecutionContext.java`
- `D:\doc\code\apiFlow项目课程\20250725_apiFlow\apiFlow-core\src\main\java\org\apiFlow\core\FlowExecutionListener.java`
- `D:\doc\code\apiFlow项目课程\20250725_apiFlow\apiFlow-core\src\main\java\org\apiFlow\core\TaskExecutionListener.java`
- `D:\doc\code\apiFlow项目课程\20250725_apiFlow\apiFlow-core\src\main\java\org\apiFlow\core\AbstractScript.java`
- `D:\doc\code\apiFlow项目课程\20250725_apiFlow\apiFlow-core\src\main\java\org\apiFlow\core\FlowEngine.java`

**Files in main repo:**
- Create: `docs/apiflow-extension-plan.md`

- [ ] **Step 1: Document external-only extension policy**

Create `docs/apiflow-extension-plan.md` with:

```markdown
# ApiFlow External Extension Plan

All ApiFlow core changes live in `D:\doc\code\apiFlow项目课程\20250725_apiFlow`, not in this repository.

Required extensions:

1. `ExecutionContext`
   - runId
   - flowPath
   - input
   - attachInput
   - cancelled flag

2. `FlowExecutionListener`
   - flowStarted
   - flowSucceeded
   - flowFailed
   - flowCancelled

3. `TaskExecutionListener`
   - taskStarted
   - taskSucceeded
   - taskFailed
   - taskLogged

4. `FlowEngine.execute(ExecutionContext context)`
   - keeps old execute overloads
   - emits run events
   - passes context into script binding

5. `AbstractScript.run(...)` instrumentation
   - emits task lifecycle events around state changes
   - includes task type, name, state, result, runtimeError, useTime

6. cancellation
   - checks context cancellation before every task
   - marks flow cancelled with a stable error/result envelope
```

- [ ] **Step 2: Commit only the documentation**

```powershell
git add docs/apiflow-extension-plan.md
git commit -m "docs: define external apiflow extension policy"
```

Do not commit external ApiFlow source changes into the main repo.

---

## Task 7: Add Groovy Workflow Loading After Real Runtime Works

**Files:**
- Create: `apps/api/src/apiflow/groovy-workflow-parser.ts`
- Create: `apps/api/test/apiflow-parser.test.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/web/src/components/ApiFlowViewer.tsx`

- [ ] **Step 1: Keep this task blocked until Task 4 passes**

Do not build screenshot-style graph loading until real sidecar execution through `apiflow-http` works.

- [ ] **Step 2: Implement limited parser**

Parse:

- `taskName = EVAL {`
- `taskName = HTTP {`
- `taskName = SWITCH {`
- `start { run taskName }`
- `when routeTask, branchTask1, branchTask2`

Return diagnostics for unsupported syntax.

- [ ] **Step 3: Add read-only viewer**

Render loaded Groovy graph as `flow://...groovy`, not as the editable Studio graph.

- [ ] **Step 4: Commit**

```powershell
git add packages/shared/src/index.ts apps/api/src/apiflow/groovy-workflow-parser.ts apps/api/test/apiflow-parser.test.ts apps/web/src/components/ApiFlowViewer.tsx
git commit -m "feat: load external apiflow groovy workflows"
```

---

## Verification Checklist

Run before any Phase 6 implementation commit:

```powershell
npm.cmd run check:repo-boundary
git status --short
```

Run after TypeScript changes:

```powershell
npm.cmd run test --workspace apps/api
npm.cmd run test --workspace apps/web
npm.cmd run typecheck
```

Run after sidecar changes:

```powershell
$env:APIFLOW_SOURCE_DIR = "D:\doc\code\apiFlow项目课程\20250725_apiFlow"
npm.cmd run test:apiflow
```

Before pushing:

```powershell
npm.cmd run check:repo-boundary
git diff --cached --name-only
```

Expected: no path containing `20250725_apiFlow`, `apiFlow-core`, `apiFlow-control`, or `apiFlow-spring` is staged.

## Self-Review

- The plan uses `20250725_apiFlow` as the real ApiFlow baseline.
- The main repo never tracks ApiFlow source.
- The sidecar wrapper is tracked, but it imports ApiFlow as an external dependency.
- The plan supports both stable `mavenLocal` and active `APIFLOW_SOURCE_DIR` development.
- The plan keeps screenshot-style Groovy loading separate from the first real execution slice.
- The plan includes Git boundary checks before commit and push.
