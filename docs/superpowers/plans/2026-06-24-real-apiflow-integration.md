# Real ApiFlow Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current fake ApiFlow path with a real Java ApiFlow sidecar, then add Groovy workflow loading so the Studio can approach the video prototype's `flow://...groovy` visual workflow experience.

**Architecture:** Keep the TypeScript Studio API as the owner of projects, saved workflow records, WebSocket fan-out, and UI contracts. Add a Java sidecar inside this isolated repo that wraps ApiFlow `FlowEngine.execute(...)` behind stable HTTP endpoints; the existing `HttpApiFlowRuntimeAdapter` becomes the only production ApiFlow adapter. Treat Groovy-to-graph loading as a second vertical slice after real execution works.

**Tech Stack:** Fastify, SQLite, Vitest, React Flow, TypeScript, Java, Gradle, ApiFlow core, Groovy, JUnit.

---

## Current State

- Current branch/worktree: `D:\doc\code\apiFlow项目课程\ai-app-generator-mvp\.worktrees\implement-mvp`.
- Current latest commit inspected: `46c9700 fix: remove template select UI from project creation`.
- `WORKFLOW_RUNTIME=local` is the default, so workflow runs normally use `WorkflowExecutor`.
- `WORKFLOW_RUNTIME=apiflow` currently uses `FakeApiFlowRuntimeAdapter`, not real ApiFlow.
- `WORKFLOW_RUNTIME=apiflow-http` uses `HttpApiFlowRuntimeAdapter`, but no Java sidecar implementation exists in this repo.
- ApiFlow Java core has `FlowEngine.execute(String flowPath, Object input, Map<String,Object> attachInput)`, but it only returns a final result and does not expose public run IDs, node events, cancellation, or structured execution events.
- Current `DslCompiler` only supports `Studio graph -> Groovy DSL`; it does not parse existing Groovy DSL into a graph.
- The screenshot/prototype requires `Groovy DSL file -> rendered graph -> node status`, so that is a later slice after real execution.

## Scope Split

### Slice A: Real Execution

Run a simple Studio workflow through a real Java sidecar using ApiFlow `FlowEngine`.

Acceptance:

- `WORKFLOW_RUNTIME=apiflow-http` starts a run against a local Java sidecar.
- The sidecar writes generated DSL into an isolated runtime directory.
- The sidecar initializes/reloads `FlowEngine`.
- The sidecar executes the flow and returns a real external run ID.
- TypeScript API persists `runtime='apiflow'` and `external_run_id`.
- Polling updates run status from `queued/running` to `succeeded/failed`.

### Slice B: Prototype-Like Groovy Loading

Load an existing `.groovy` ApiFlow file and render a read-only graph like the screenshot.

Acceptance:

- User can load a local ApiFlow DSL file path through the Studio API.
- The backend returns parsed nodes and edges for simple `task = TYPE {}`, `run task`, and `when switchTask, ...` flows.
- The frontend can show a `flow://flow/name.groovy` view with ApiFlow-style node cards and edges.
- This first parser is intentionally limited and returns explicit unsupported-syntax diagnostics.

---

## File Structure

### Java Sidecar

- Create: `apps/apiflow-sidecar/settings.gradle`
  Defines a two-module Gradle build: `apiFlow-core` and `runtime`.

- Create/Copy: `apps/apiflow-sidecar/apiFlow-core/**`
  Vendored copy of course `apiFlow-core` source so the isolated project does not depend on parent course files at runtime or in Git commits.

- Create: `apps/apiflow-sidecar/runtime/build.gradle`
  Java application module with dependencies on vendored `apiFlow-core`, Jackson, and test libraries.

- Create: `apps/apiflow-sidecar/runtime/src/main/java/com/aigenerator/apiflow/SidecarMain.java`
  Starts an HTTP server and routes requests.

- Create: `apps/apiflow-sidecar/runtime/src/main/java/com/aigenerator/apiflow/ApiFlowRuntimeService.java`
  Owns workflow DSL file writes, `FlowEngine` lifecycle, async run registry, status transitions, and cancellation flags.

- Create: `apps/apiflow-sidecar/runtime/src/main/java/com/aigenerator/apiflow/ApiFlowDtos.java`
  Request/response DTOs matching the TypeScript shared contract.

- Create: `apps/apiflow-sidecar/runtime/src/test/java/com/aigenerator/apiflow/ApiFlowRuntimeServiceTest.java`
  Unit/integration tests for real `FlowEngine` execution.

### TypeScript API

- Modify: `apps/api/src/apiflow/apiflow-http-adapter.ts`
  Send generated DSL and input to the Java sidecar, map sidecar run DTOs to `ApiFlowExternalRun`, support cancellation and health.

- Modify: `apps/api/src/apiflow/apiflow-adapter.ts`
  Keep fake adapter for tests only; make production docs point to `apiflow-http`.

- Modify: `apps/api/src/routes/workflows.ts`
  Return actionable sidecar errors for export/run failures; do not collapse all ApiFlow failures into generic 500s.

- Modify: `apps/api/test/workflows.test.ts`
  Add HTTP sidecar contract tests with a local test HTTP server.

- Modify: `apps/api/src/config.ts`
  Keep `WORKFLOW_RUNTIME=apiflow-http` explicit. Do not make real sidecar the default until stable.

### Groovy Loading And Viewer

- Create: `apps/api/src/apiflow/groovy-workflow-parser.ts`
  Limited parser for named tasks, task types, `start`, `run`, and simple `when` edges.

- Test: `apps/api/test/apiflow-parser.test.ts`
  Parser coverage for simple flow, switch branches, and unsupported syntax diagnostics.

- Modify: `packages/shared/src/index.ts`
  Add `ApiFlowParsedWorkflow`, `ApiFlowParsedNode`, `ApiFlowParseDiagnostic`.

- Modify: `apps/api/src/routes/workflows.ts`
  Add import/load endpoint after parser is stable.

- Modify: `apps/web/src/api.ts`
  Add API client for loading ApiFlow workflow files.

- Modify: `apps/web/src/components/WorkflowCanvas.tsx` or create `apps/web/src/components/ApiFlowViewer.tsx`
  Render imported ApiFlow graphs read-only with task type icons and status badges.

### Docs

- Modify: `docs/local-development.md`
  Add instructions to run sidecar and API together.

- Modify: `docs/phase-roadmap.md`
  Mark Phase 6 as In Progress only after Slice A lands.

- Modify: `docs/phase6-apiflow-integration-assessment.md`
  Append implementation decisions and known v1 limitations.

---

## Task 1: Add Real ApiFlow Sidecar Skeleton

**Files:**
- Create: `apps/apiflow-sidecar/settings.gradle`
- Create: `apps/apiflow-sidecar/build.gradle`
- Create: `apps/apiflow-sidecar/runtime/build.gradle`
- Create: `apps/apiflow-sidecar/runtime/src/main/java/com/aigenerator/apiflow/SidecarMain.java`
- Create: `apps/apiflow-sidecar/runtime/src/test/java/com/aigenerator/apiflow/SidecarMainTest.java`

- [ ] **Step 1: Verify Gradle availability**

Run:

```powershell
gradle -v
```

Expected: Gradle prints a version. If this fails, stop and install Gradle or add a Gradle wrapper before continuing.

- [ ] **Step 2: Write the failing health test**

Create `apps/apiflow-sidecar/runtime/src/test/java/com/aigenerator/apiflow/SidecarMainTest.java`:

```java
package com.aigenerator.apiflow;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class SidecarMainTest {
    @Test
    void healthResponseIsOk() {
        assertEquals("{\"ok\":true}", SidecarMain.healthJson());
    }
}
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```powershell
gradle -p apps/apiflow-sidecar :runtime:test --tests com.aigenerator.apiflow.SidecarMainTest
```

Expected: FAIL because Gradle files or `SidecarMain` do not exist yet.

- [ ] **Step 4: Add minimal Gradle build**

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
        mavenCentral()
    }
}

rootProject.name = "ai-app-generator-apiflow-sidecar"
include "runtime"
```

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

repositories {
    mavenCentral()
}

dependencies {
    implementation "com.fasterxml.jackson.core:jackson-databind:2.17.2"
    testImplementation "org.junit.jupiter:junit-jupiter:5.10.3"
}

application {
    mainClass = "com.aigenerator.apiflow.SidecarMain"
}
```

- [ ] **Step 5: Add minimal sidecar entry**

Create `apps/apiflow-sidecar/runtime/src/main/java/com/aigenerator/apiflow/SidecarMain.java`:

```java
package com.aigenerator.apiflow;

public final class SidecarMain {
    private SidecarMain() {}

    public static void main(String[] args) {
        System.out.println("ApiFlow sidecar boot placeholder");
    }

    static String healthJson() {
        return "{\"ok\":true}";
    }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run:

```powershell
gradle -p apps/apiflow-sidecar :runtime:test --tests com.aigenerator.apiflow.SidecarMainTest
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/apiflow-sidecar
git commit -m "feat: add apiflow sidecar skeleton"
```

---

## Task 2: Vendor ApiFlow Core Into The Isolated Project

**Files:**
- Create/Copy: `apps/apiflow-sidecar/apiFlow-core/**`
- Modify: `apps/apiflow-sidecar/settings.gradle`
- Modify: `apps/apiflow-sidecar/apiFlow-core/build.gradle`
- Modify: `apps/apiflow-sidecar/runtime/build.gradle`
- Test: `apps/apiflow-sidecar/runtime/src/test/java/com/aigenerator/apiflow/ApiFlowEngineSmokeTest.java`

- [ ] **Step 1: Copy course ApiFlow core into the project repo**

Run from `D:\doc\code\apiFlow项目课程`:

```powershell
Copy-Item -Recurse -Force "一、引擎的使用指南\apiFlow\apiFlow-core" "ai-app-generator-mvp\.worktrees\implement-mvp\apps\apiflow-sidecar\apiFlow-core"
```

Expected: `apps/apiflow-sidecar/apiFlow-core/src/main/java/org/apiFlow/core/FlowEngine.java` exists inside the project repo.

- [ ] **Step 2: Add the vendored core module to Gradle**

Modify `apps/apiflow-sidecar/settings.gradle`:

```gradle
rootProject.name = "ai-app-generator-apiflow-sidecar"
include "apiFlow-core"
include "runtime"
```

Modify `apps/apiflow-sidecar/runtime/build.gradle` dependencies:

```gradle
dependencies {
    implementation project(":apiFlow-core")
    implementation "com.fasterxml.jackson.core:jackson-databind:2.17.2"
    testImplementation "org.junit.jupiter:junit-jupiter:5.10.3"
}
```

- [ ] **Step 3: Write the failing FlowEngine smoke test**

Create `apps/apiflow-sidecar/runtime/src/test/java/com/aigenerator/apiflow/ApiFlowEngineSmokeTest.java`:

```java
package com.aigenerator.apiflow;

import org.apiFlow.core.FlowEngine;
import org.junit.jupiter.api.Test;

import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ApiFlowEngineSmokeTest {
    @Test
    void executesGeneratedEvalDsl() throws Exception {
        Path root = Files.createTempDirectory("apiflow-smoke-");
        Path apiDir = Files.createDirectories(root.resolve("api"));
        Files.writeString(apiDir.resolve("hello.groovy"), """
            init {
                listen webhook on "/execute"
            }

            t1 = EVAL {
                "hello"
            }

            start {
                run t1
            }
            """);

        FlowEngine engine = new FlowEngine(new URL[]{root.toUri().toURL()});
        engine.reLoad();
        Object result = engine.execute("hello.groovy", java.util.Map.of());

        assertEquals("hello", result);
    }
}
```

- [ ] **Step 4: Run test**

Run:

```powershell
gradle -p apps/apiflow-sidecar :runtime:test --tests com.aigenerator.apiflow.ApiFlowEngineSmokeTest
```

Expected: PASS after build files resolve vendored dependencies. If compile fails because of copied test-only dependencies in `apiFlow-core`, remove unrelated copied test source from `apps/apiflow-sidecar/apiFlow-core/src/test` in a separate commit and keep `src/main` intact.

- [ ] **Step 5: Commit**

```powershell
git add apps/apiflow-sidecar
git commit -m "feat: vendor apiflow core for sidecar"
```

---

## Task 3: Implement Sidecar Run/Status API

**Files:**
- Create: `apps/apiflow-sidecar/runtime/src/main/java/com/aigenerator/apiflow/ApiFlowDtos.java`
- Create: `apps/apiflow-sidecar/runtime/src/main/java/com/aigenerator/apiflow/ApiFlowRuntimeService.java`
- Modify: `apps/apiflow-sidecar/runtime/src/main/java/com/aigenerator/apiflow/SidecarMain.java`
- Test: `apps/apiflow-sidecar/runtime/src/test/java/com/aigenerator/apiflow/ApiFlowRuntimeServiceTest.java`

- [ ] **Step 1: Write failing runtime service test**

Create `apps/apiflow-sidecar/runtime/src/test/java/com/aigenerator/apiflow/ApiFlowRuntimeServiceTest.java`:

```java
package com.aigenerator.apiflow;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class ApiFlowRuntimeServiceTest {
    @Test
    void startsAndCompletesARealFlowEngineRun() throws Exception {
        ApiFlowRuntimeService service = new ApiFlowRuntimeService(Files.createTempDirectory("apiflow-runtime-"));
        ApiFlowDtos.StartRunRequest request = new ApiFlowDtos.StartRunRequest();
        request.workflowId = "workflow-1";
        request.dsl = """
            init {
                listen webhook on "/execute"
            }

            t1 = EVAL {
                "hello " + input.name
            }

            start {
                run t1
            }
            """;
        request.input = Map.of("name", "ApiFlow");

        ApiFlowDtos.RunResponse started = service.startRun(request);
        assertNotNull(started.externalRunId);

        ApiFlowDtos.RunResponse finished = waitForTerminal(service, started.externalRunId);
        assertEquals("succeeded", finished.status);
        assertEquals("hello ApiFlow", finished.result);
    }

    private static ApiFlowDtos.RunResponse waitForTerminal(ApiFlowRuntimeService service, String runId) throws Exception {
        Instant deadline = Instant.now().plus(Duration.ofSeconds(5));
        ApiFlowDtos.RunResponse run = service.getRun(runId);
        while (!run.status.equals("succeeded") && !run.status.equals("failed") && Instant.now().isBefore(deadline)) {
            Thread.sleep(25);
            run = service.getRun(runId);
        }
        return run;
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
gradle -p apps/apiflow-sidecar :runtime:test --tests com.aigenerator.apiflow.ApiFlowRuntimeServiceTest
```

Expected: FAIL because DTOs and runtime service do not exist.

- [ ] **Step 3: Implement DTOs**

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

- [ ] **Step 4: Implement runtime service**

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
        String now = Instant.now().toString();
        ApiFlowDtos.RunResponse run = new ApiFlowDtos.RunResponse();
        run.externalRunId = runId;
        run.workflowId = request.workflowId;
        run.status = "queued";
        run.createdAt = now;
        runs.put(runId, run);

        executor.submit(() -> executeRun(run, request));
        return run;
    }

    public ApiFlowDtos.RunResponse getRun(String runId) {
        ApiFlowDtos.RunResponse run = runs.get(runId);
        if (run == null) {
            throw new IllegalArgumentException("ApiFlow run not found: " + runId);
        }
        return run;
    }

    public void cancelRun(String runId) {
        ApiFlowDtos.RunResponse run = getRun(runId);
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

- [ ] **Step 5: Run test**

Run:

```powershell
gradle -p apps/apiflow-sidecar :runtime:test --tests com.aigenerator.apiflow.ApiFlowRuntimeServiceTest
```

Expected: PASS.

- [ ] **Step 6: Add HTTP routes**

Modify `SidecarMain.java` to expose:

- `GET /api/apiflow/health`
- `POST /api/apiflow/workflows/{workflowId}/runs`
- `GET /api/apiflow/runs/{externalRunId}`
- `POST /api/apiflow/runs/{externalRunId}/cancel`

Use `com.sun.net.httpserver.HttpServer` and Jackson `ObjectMapper`; keep request parsing in small private methods.

- [ ] **Step 7: Commit**

```powershell
git add apps/apiflow-sidecar
git commit -m "feat: execute apiflow runs in sidecar"
```

---

## Task 4: Wire TypeScript API To The Real Sidecar

**Files:**
- Modify: `apps/api/src/apiflow/apiflow-http-adapter.ts`
- Modify: `apps/api/test/workflows.test.ts`

- [ ] **Step 1: Add failing HTTP adapter contract test**

Add a test in `apps/api/test/workflows.test.ts`:

```ts
it("runs workflows through the HTTP ApiFlow sidecar", async () => {
  tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-workflows-"));
  const sidecar = await startTestSidecar({
    runResponse: { runId: "real-sidecar-run-1" },
    statusResponse: {
      externalRunId: "real-sidecar-run-1",
      workflowId: "workflow-id",
      status: "succeeded",
      result: "ok",
      error: null,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    }
  });
  const config = loadConfig({
    STORAGE_DIR: path.join(tempDir, "storage"),
    WORKSPACE_DIR: path.join(tempDir, "workspaces"),
    TEMPLATES_DIR: path.resolve(process.cwd(), "templates"),
    WORKFLOW_RUNTIME: "apiflow-http",
    APIFLOW_SIDECAR_URL: sidecar.url
  });
  const app = await createServer(config);

  try {
    const createRes = await app.inject({ method: "POST", url: "/api/projects", payload: { name: "ApiFlow HTTP Project" } });
    const project = createRes.json();
    const wfRes = await app.inject({ method: "POST", url: `/api/projects/${project.id}/workflows`, payload: { name: "ApiFlow HTTP WF" } });
    const workflow = wfRes.json();
    await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/workflows/${workflow.id}`,
      payload: {
        graph: {
          nodes: [{ id: "input", type: "user_input", position: { x: 0, y: 0 }, data: { prompt: "hello" } }],
          edges: []
        }
      }
    });

    const runRes = await app.inject({ method: "POST", url: `/api/projects/${project.id}/workflows/${workflow.id}/run` });
    expect(runRes.statusCode).toBe(202);
    expect(runRes.json().runtime).toBe("apiflow");
    expect(runRes.json().externalRunId).toBe("real-sidecar-run-1");
    expect(sidecar.requests[0].body.dsl).toContain("EVAL");
  } finally {
    await app.close();
    await sidecar.close();
  }
});
```

Create the test helper in the same file or a new `apps/api/test/helpers/sidecar.ts` using Node `http.createServer`.

- [ ] **Step 2: Run test to verify failure**

Run:

```powershell
npm.cmd run test --workspace apps/api -- apps/api/test/workflows.test.ts
```

Expected: FAIL until the adapter sends the expected sidecar body and maps response shape.

- [ ] **Step 3: Update `HttpApiFlowRuntimeAdapter.startRun`**

Modify `apps/api/src/apiflow/apiflow-http-adapter.ts`:

```ts
async startRun(input: ApiFlowRunInput): Promise<ApiFlowExternalRun> {
  const exported = await this.exportWorkflow(input);
  const response = await this.request<ApiFlowExternalRun | { runId: string }>(
    `/api/apiflow/workflows/${encodeURIComponent(input.workflowId)}/runs`,
    {
      method: "POST",
      body: JSON.stringify({
        workflowId: input.workflowId,
        workflowName: input.workflowName,
        dsl: exported.dsl,
        input: {}
      })
    }
  );

  if ("externalRunId" in response) return response;

  return {
    externalRunId: response.runId,
    workflowId: input.workflowId,
    status: "queued",
    result: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    createdAt: new Date().toISOString()
  };
}
```

- [ ] **Step 4: Run tests**

Run:

```powershell
npm.cmd run test --workspace apps/api -- apps/api/test/workflows.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/apiflow/apiflow-http-adapter.ts apps/api/test/workflows.test.ts
git commit -m "feat: run workflows through http apiflow sidecar"
```

---

## Task 5: Add Local Development Wiring

**Files:**
- Modify: `package.json`
- Modify: `docs/local-development.md`
- Modify: `docs/phase-roadmap.md`

- [ ] **Step 1: Add scripts**

Modify root `package.json` scripts:

```json
{
  "dev:apiflow": "gradle -p apps/apiflow-sidecar :runtime:run",
  "test:apiflow": "gradle -p apps/apiflow-sidecar :runtime:test"
}
```

- [ ] **Step 2: Document run commands**

Add to `docs/local-development.md`:

```powershell
npm.cmd run dev:apiflow

$env:WORKFLOW_RUNTIME = "apiflow-http"
$env:APIFLOW_SIDECAR_URL = "http://127.0.0.1:9527"
npm.cmd run dev:api

npm.cmd run dev:web
```

Expected manual behavior:

- API `/api/health` remains OK.
- Sidecar `/api/apiflow/health` returns `{ "ok": true }`.
- Running an ApiFlow-compatible workflow stores `externalRunId`.

- [ ] **Step 3: Run full verification**

Run:

```powershell
npm.cmd run test:apiflow
npm.cmd run test --workspace apps/api -- apps/api/test/workflows.test.ts
npm.cmd run typecheck
```

Expected: all pass.

- [ ] **Step 4: Commit**

```powershell
git add package.json docs/local-development.md docs/phase-roadmap.md
git commit -m "docs: add real apiflow runtime workflow"
```

---

## Task 6: Surface Sidecar Failures Cleanly

**Files:**
- Modify: `apps/api/src/apiflow/apiflow-http-adapter.ts`
- Modify: `apps/api/src/routes/workflows.ts`
- Test: `apps/api/test/workflows.test.ts`

- [ ] **Step 1: Add failing sidecar error test**

Add a test where the sidecar returns HTTP 400 with body:

```json
{"message":"Groovy parse failed","details":["line 4: unexpected token"]}
```

Expected API response:

```ts
expect(runRes.statusCode).toBe(502);
expect(runRes.json().message).toBe("ApiFlow runtime failed");
expect(runRes.json().reason).toContain("Groovy parse failed");
expect(runRes.body).not.toContain(config.workspaceDir);
```

- [ ] **Step 2: Implement a typed adapter error**

Add an exported error class in `apps/api/src/apiflow/apiflow-http-adapter.ts`:

```ts
export class ApiFlowSidecarError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly body: string
  ) {
    super(`ApiFlow sidecar returned ${statusCode}: ${body}`);
    this.name = "ApiFlowSidecarError";
  }
}
```

Throw this error in `request()` when `!response.ok`.

- [ ] **Step 3: Map route error to client-safe response**

In `apps/api/src/routes/workflows.ts`, catch sidecar errors in `/run` and `/export` paths:

```ts
if (error instanceof ApiFlowSidecarError) {
  return reply.code(502).send({
    message: "ApiFlow runtime failed",
    reason: sanitizeSidecarBody(error.body)
  });
}
```

Use a local sanitizer that truncates to 1000 chars and strips configured workspace paths.

- [ ] **Step 4: Run tests and commit**

```powershell
npm.cmd run test --workspace apps/api -- apps/api/test/workflows.test.ts
git add apps/api/src/apiflow/apiflow-http-adapter.ts apps/api/src/routes/workflows.ts apps/api/test/workflows.test.ts
git commit -m "fix: return client-safe apiflow sidecar errors"
```

---

## Task 7: Add Limited Groovy DSL Parser

**Files:**
- Create: `apps/api/src/apiflow/groovy-workflow-parser.ts`
- Create: `apps/api/test/apiflow-parser.test.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/index.test.ts`

- [ ] **Step 1: Add shared parsed workflow types**

Modify `packages/shared/src/index.ts`:

```ts
export interface ApiFlowParsedNode {
  id: string;
  taskName: string;
  taskType: string;
  label: string;
  sourceLine: number;
  data: Record<string, unknown>;
}

export interface ApiFlowParsedEdge {
  id: string;
  source: string;
  target: string;
  label: string | null;
}

export interface ApiFlowParseDiagnostic {
  severity: "warning" | "error";
  message: string;
  line: number | null;
}

export interface ApiFlowParsedWorkflow {
  flowPath: string;
  nodes: ApiFlowParsedNode[];
  edges: ApiFlowParsedEdge[];
  diagnostics: ApiFlowParseDiagnostic[];
}
```

- [ ] **Step 2: Write failing parser tests**

Create `apps/api/test/apiflow-parser.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseGroovyWorkflow } from "../src/apiflow/groovy-workflow-parser.js";

describe("parseGroovyWorkflow", () => {
  it("parses task declarations and run edges", () => {
    const parsed = parseGroovyWorkflow("flow/create_menu.groovy", `
t1 = EVAL { "token" }
t2 = HTTP { url = "https://example.test" }
start {
  run t1
  run t2
}
`);

    expect(parsed.nodes.map((node) => node.taskName)).toEqual(["t1", "t2"]);
    expect(parsed.edges).toEqual([
      expect.objectContaining({ source: "t1", target: "t2", label: null })
    ]);
    expect(parsed.diagnostics).toEqual([]);
  });

  it("parses switch branches from when syntax", () => {
    const parsed = parseGroovyWorkflow("flow/menu.groovy", `
route = SWITCH { items = ["create", "delete"] }
task_create_menu = HTTP { url = "https://example.test/create" }
task_delete_menu = HTTP { url = "https://example.test/delete" }
start {
  when route, task_create_menu, task_delete_menu
}
`);

    expect(parsed.edges).toEqual([
      expect.objectContaining({ source: "route", target: "task_create_menu", label: "branch 0" }),
      expect.objectContaining({ source: "route", target: "task_delete_menu", label: "branch 1" })
    ]);
  });
});
```

- [ ] **Step 3: Implement parser**

Create `apps/api/src/apiflow/groovy-workflow-parser.ts`:

```ts
import type { ApiFlowParsedWorkflow, ApiFlowParsedNode, ApiFlowParsedEdge } from "@ai-app-generator/shared";

const taskDeclaration = /^\\s*([a-zA-Z_][\\w]*)\\s*=\\s*([A-Z_][A-Z0-9_]*)\\s*(?:\\{|\\()/;
const runStatement = /^\\s*run\\s+([a-zA-Z_][\\w]*)\\s*$/;
const whenStatement = /^\\s*when\\s+([a-zA-Z_][\\w]*)\\s*,\\s*(.+)$/;

export function parseGroovyWorkflow(flowPath: string, source: string): ApiFlowParsedWorkflow {
  const nodes: ApiFlowParsedNode[] = [];
  const edges: ApiFlowParsedEdge[] = [];
  const diagnostics: ApiFlowParsedWorkflow["diagnostics"] = [];
  const lines = source.split(/\\r?\\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(taskDeclaration);
    if (match) {
      const [, taskName, taskType] = match;
      nodes.push({
        id: taskName,
        taskName,
        taskType,
        label: taskName,
        sourceLine: index + 1,
        data: {}
      });
    }
  }

  let previousRun: string | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const runMatch = line.match(runStatement);
    if (runMatch) {
      const target = runMatch[1];
      if (previousRun) {
        edges.push({ id: `${previousRun}->${target}`, source: previousRun, target, label: null });
      }
      previousRun = target;
      continue;
    }

    const whenMatch = line.match(whenStatement);
    if (whenMatch) {
      const source = whenMatch[1];
      const targets = whenMatch[2].split(",").map((part) => part.trim()).filter(Boolean);
      targets.forEach((target, branchIndex) => {
        edges.push({ id: `${source}->${target}:${branchIndex}`, source, target, label: `branch ${branchIndex}` });
      });
    }
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      diagnostics.push({
        severity: "warning",
        message: `Edge references unknown task: ${edge.source} -> ${edge.target}`,
        line: null
      });
    }
  }

  return { flowPath, nodes, edges, diagnostics };
}
```

- [ ] **Step 4: Run parser tests**

Run:

```powershell
npm.cmd run test --workspace apps/api -- apps/api/test/apiflow-parser.test.ts
npm.cmd run test --workspace packages/shared
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/shared/src/index.ts apps/api/src/apiflow/groovy-workflow-parser.ts apps/api/test/apiflow-parser.test.ts
git commit -m "feat: parse simple apiflow groovy workflows"
```

---

## Task 8: Add Backend Endpoint To Load ApiFlow Groovy Files

**Files:**
- Modify: `apps/api/src/config.ts`
- Modify: `apps/api/src/routes/workflows.ts`
- Modify: `apps/api/src/server.ts`
- Test: `apps/api/test/workflows.test.ts`

- [ ] **Step 1: Add config value**

Add to `AppConfig`:

```ts
apiFlowDslRoot: string | null;
```

Load from env:

```ts
apiFlowDslRoot: env.APIFLOW_DSL_ROOT ? path.resolve(appRoot, env.APIFLOW_DSL_ROOT) : null
```

- [ ] **Step 2: Add failing endpoint test**

Add test:

```ts
it("loads a Groovy ApiFlow workflow from the configured DSL root", async () => {
  tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-apiflow-load-"));
  const dslRoot = path.join(tempDir, "dsl");
  mkdirSync(path.join(dslRoot, "flow"), { recursive: true });
  writeFileSync(path.join(dslRoot, "flow", "create_menu.groovy"), `
task_get_token = HTTP { url = "https://example.test/token" }
task_create_menu = HTTP { url = "https://example.test/create" }
start {
  run task_get_token
  run task_create_menu
}
`);
  const app = await createServer(loadConfig({
    STORAGE_DIR: path.join(tempDir, "storage"),
    WORKSPACE_DIR: path.join(tempDir, "workspaces"),
    APIFLOW_DSL_ROOT: dslRoot
  }));

  const response = await app.inject({
    method: "GET",
    url: `/api/apiflow/workflows/load?path=${encodeURIComponent("flow/create_menu.groovy")}`
  });

  expect(response.statusCode).toBe(200);
  expect(response.json().nodes.map((node: any) => node.taskName)).toEqual(["task_get_token", "task_create_menu"]);
  await app.close();
});
```

- [ ] **Step 3: Implement safe file loading route**

Add a route that:

- rejects missing `APIFLOW_DSL_ROOT` with 500 `{ message: "ApiFlow DSL root not configured" }`
- rejects absolute paths and `..`
- only allows `.groovy`
- reads UTF-8 source
- returns `parseGroovyWorkflow(relativePath, source)`

- [ ] **Step 4: Run tests and commit**

```powershell
npm.cmd run test --workspace apps/api -- apps/api/test/workflows.test.ts apps/api/test/apiflow-parser.test.ts
git add apps/api/src/config.ts apps/api/src/routes/workflows.ts apps/api/src/server.ts apps/api/test/workflows.test.ts
git commit -m "feat: load apiflow groovy workflows"
```

---

## Task 9: Add Read-Only ApiFlow Viewer In The Web UI

**Files:**
- Modify: `apps/web/src/api.ts`
- Create: `apps/web/src/components/ApiFlowViewer.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/App.test.tsx`

- [ ] **Step 1: Add API client**

In `apps/web/src/api.ts`:

```ts
import type { ApiFlowParsedWorkflow } from "@ai-app-generator/shared";

export async function loadApiFlowWorkflow(path: string): Promise<ApiFlowParsedWorkflow> {
  return request<ApiFlowParsedWorkflow>(
    `/api/apiflow/workflows/load?path=${encodeURIComponent(path)}`
  );
}
```

- [ ] **Step 2: Add viewer component**

Create `apps/web/src/components/ApiFlowViewer.tsx`:

```tsx
import { ReactFlow, Background, Controls, type Node, type Edge } from "@xyflow/react";
import type { ApiFlowParsedWorkflow } from "@ai-app-generator/shared";

export function ApiFlowViewer({ workflow }: { workflow: ApiFlowParsedWorkflow }) {
  const nodes: Node[] = workflow.nodes.map((node, index) => ({
    id: node.id,
    type: "default",
    position: { x: 320, y: index * 130 },
    data: { label: `${node.taskName}\\n${node.taskType}` }
  }));
  const edges: Edge[] = workflow.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label ?? undefined
  }));

  return (
    <div className="apiflow-viewer">
      <div className="apiflow-address">flow://{workflow.flowPath}</div>
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <Controls />
        <Background />
      </ReactFlow>
    </div>
  );
}
```

- [ ] **Step 3: Add UI entry**

In `apps/web/src/App.tsx`, add a small load form in the Workflow tab:

```tsx
<form onSubmit={handleLoadApiFlowWorkflow} className="apiflow-load-form">
  <input value={apiFlowPath} onChange={(event) => setApiFlowPath(event.target.value)} placeholder="flow/create_menu.groovy" />
  <button type="submit">Load ApiFlow</button>
</form>
```

Keep manual Workflow builder unchanged.

- [ ] **Step 4: Add tests**

In `apps/web/src/App.test.tsx`, mock `/api/apiflow/workflows/load` and assert `flow://flow/create_menu.groovy` appears after loading.

- [ ] **Step 5: Run web tests and commit**

```powershell
npm.cmd run test --workspace apps/web
npm.cmd run typecheck
git add apps/web/src/api.ts apps/web/src/components/ApiFlowViewer.tsx apps/web/src/App.tsx apps/web/src/styles.css apps/web/src/App.test.tsx
git commit -m "feat: show loaded apiflow groovy workflows"
```

---

## Task 10: End-To-End Manual Verification

**Files:**
- Modify: `docs/local-development.md`
- Modify: `docs/phase-roadmap.md`

- [ ] **Step 1: Start sidecar**

Run:

```powershell
cd D:\doc\code\apiFlow项目课程\ai-app-generator-mvp\.worktrees\implement-mvp
npm.cmd run dev:apiflow
```

Expected:

```text
ApiFlow sidecar listening on http://127.0.0.1:9527
```

- [ ] **Step 2: Start API**

Run in a second terminal:

```powershell
$env:WORKFLOW_RUNTIME = "apiflow-http"
$env:APIFLOW_SIDECAR_URL = "http://127.0.0.1:9527"
$env:APIFLOW_DSL_ROOT = "D:\doc\code\apiFlow项目课程\一、引擎的使用指南\apiFlow\demo\email\dsl\api"
npm.cmd run dev:api
```

Expected: API starts and `/api/health` returns `{ ok: true }`.

- [ ] **Step 3: Start web**

Run:

```powershell
npm.cmd run dev:web
```

Expected: Studio opens and the Workflow tab loads.

- [ ] **Step 4: Verify real execution**

Create a project, create a workflow with one `user_input` node, run it.

Expected:

- run status starts `queued`
- run runtime is `apiflow`
- `externalRunId` starts with `apiflow-`
- run eventually becomes `succeeded`

- [ ] **Step 5: Verify Groovy loading**

Load a known DSL path.

Expected:

- UI shows `flow://...groovy`
- task nodes appear
- sequential `run` edges appear
- unsupported syntax appears as diagnostics, not a crash

- [ ] **Step 6: Update docs and commit**

```powershell
git add docs/local-development.md docs/phase-roadmap.md
git commit -m "docs: verify real apiflow integration"
```

---

## Risks And Decisions

- Do not edit or commit files directly under `D:\doc\code\apiFlow项目课程\一、引擎的使用指南\apiFlow`. Copy required runtime code into `apps/apiflow-sidecar`.
- The first sidecar can support best-effort cancellation only. ApiFlow core does not currently check cancellation during tasks.
- Node-level status in the screenshot requires ApiFlow task lifecycle events. The first real execution slice will only provide run-level status unless we add public listeners or instrument `AbstractScript.run(...)`.
- The Groovy parser is intentionally limited. It is for visualization of common DSL files, not a full Groovy interpreter.
- Existing Studio workflow execution with `agent_generation` and `shell_command` remains local-only. ApiFlow v1 supports `user_input` and `http_request` unless custom ApiFlow tasks are added.

## Self-Review

- Slice A covers real sidecar execution, HTTP adapter wiring, local dev commands, and client-safe errors.
- Slice B covers Groovy loading and read-only graph display needed for the screenshot direction.
- No task requires committing parent course files.
- Current default runtime remains `local`, so existing tests and demos are not broken while sidecar matures.
- Full screenshot parity still needs a future task for public ApiFlow task lifecycle events and per-node status mapping.
