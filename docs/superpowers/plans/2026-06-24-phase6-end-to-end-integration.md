# Phase 6 End-To-End Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify the full first user interaction from browser to Fastify API to ApiFlow sidecar to external `FlowEngine`, while keeping ApiFlow source isolated from the main repository.

**Architecture:** This plan runs after the main project sidecar plan and the external ApiFlow source plan. It validates four live processes, run-level status, optional task-level events, OpenCode integration, and Git boundary safety. The acceptance target is a user creating a project/workflow and seeing the real ApiFlow run complete in the UI.

**Tech Stack:** PowerShell, npm workspaces, Fastify, React/Vite, Java/Gradle, ApiFlow sidecar, external `20250725_apiFlow`, Vitest, Playwright or browser manual verification.

---

## Preconditions

Complete these first:

- `2026-06-24-phase6-main-project-sidecar.md` Tasks 1-4.
- `2026-06-24-phase6-apiflow-source-extension.md` Tasks 1-6 if task-level events are required.

Minimum viable integration can run before external source extension if only run-level status is required.

Before running commands that reference `$COURSE_ROOT`, set it from the main worktree:

```powershell
$COURSE_ROOT = (Resolve-Path "..\..\..").Path
```

---

## Task 1: Prepare Local Environment

**Files:**
- Modify: `.env.example` if it exists, otherwise modify `docs/local-development.md`
- Test: shell commands only

- [ ] **Step 1: Confirm repositories are separate**

Run:

```powershell
cd "$COURSE_ROOT\ai-app-generator-mvp\.worktrees\implement-mvp"
git rev-parse --show-toplevel

cd "$COURSE_ROOT\20250725_apiFlow"
git rev-parse --show-toplevel
```

Expected:

```text
...\ai-app-generator-mvp\.worktrees\implement-mvp
...\20250725_apiFlow
```

- [ ] **Step 2: Confirm main repo boundary check**

Run:

```powershell
cd "$COURSE_ROOT\ai-app-generator-mvp\.worktrees\implement-mvp"
npm.cmd run check:repo-boundary
```

Expected:

```text
Repository boundary check passed.
```

- [ ] **Step 3: Choose dependency mode**

For active ApiFlow source development:

```powershell
$env:APIFLOW_SOURCE_DIR = "$COURSE_ROOT\20250725_apiFlow"
```

For stable local artifact development:

```powershell
cd "$COURSE_ROOT\20250725_apiFlow"
.\gradlew.bat :apiFlow-core:publishToMavenLocal
```

Use `APIFLOW_SOURCE_DIR` for the first Phase 6 integration until the engine extension stabilizes.

---

## Task 2: Verify Unit And Contract Tests

**Files:**
- No code changes

- [ ] **Step 1: Run external ApiFlow tests**

Run:

```powershell
cd "$COURSE_ROOT\20250725_apiFlow"
.\gradlew.bat :apiFlow-core:test
```

Expected: all tests pass.

- [ ] **Step 2: Run sidecar tests**

Run:

```powershell
cd "$COURSE_ROOT\ai-app-generator-mvp\.worktrees\implement-mvp"
$env:APIFLOW_SOURCE_DIR = "$COURSE_ROOT\20250725_apiFlow"
npm.cmd run test:apiflow
```

Expected: sidecar tests pass and no ApiFlow source files appear in `git status --short`.

- [ ] **Step 3: Run TypeScript tests**

Run:

```powershell
npm.cmd run test --workspace apps/api
npm.cmd run test --workspace apps/web
npm.cmd run typecheck
```

Expected: all TypeScript tests pass.

---

## Task 3: Start Four Local Processes

**Files:**
- No code changes

- [ ] **Step 1: Start ApiFlow sidecar**

Terminal A:

```powershell
cd "$COURSE_ROOT\ai-app-generator-mvp\.worktrees\implement-mvp"
$env:APIFLOW_SOURCE_DIR = "$COURSE_ROOT\20250725_apiFlow"
$env:APIFLOW_SIDECAR_PORT = "9527"
npm.cmd run dev:apiflow
```

Expected:

```text
ApiFlow sidecar listening on http://127.0.0.1:9527
```

- [ ] **Step 2: Start Fastify API with real sidecar runtime**

Terminal B:

```powershell
cd "$COURSE_ROOT\ai-app-generator-mvp\.worktrees\implement-mvp"
$env:WORKFLOW_RUNTIME = "apiflow-http"
$env:APIFLOW_SIDECAR_URL = "http://127.0.0.1:9527"
$env:AGENT_PROVIDER = "opencode"
$env:OPENCODE_COMMAND = "opencode"
npm.cmd run dev:api
```

Expected: API listens on `http://127.0.0.1:4317`.

- [ ] **Step 3: Start React app**

Terminal C:

```powershell
cd "$COURSE_ROOT\ai-app-generator-mvp\.worktrees\implement-mvp"
npm.cmd run dev:web
```

Expected: web app listens on `http://127.0.0.1:5173`.

- [ ] **Step 4: Verify health endpoints**

Terminal D:

```powershell
Invoke-RestMethod http://127.0.0.1:9527/api/apiflow/health
Invoke-RestMethod http://127.0.0.1:4317/api/health
```

Expected:

```text
sidecar ok = true
api ok = true
agent provider is opencode or reports actionable health error
```

---

## Task 4: Run First User Interaction Through Real ApiFlow

**Files:**
- No code changes unless a bug is found

- [ ] **Step 1: Create a project in the UI**

Open:

```text
http://127.0.0.1:5173
```

Create project:

```text
Todo App
```

Expected:

- Project appears in the left panel.
- Workspace file tree is empty until OpenCode or workflow execution creates files.

- [ ] **Step 2: Send first prompt through OpenCode**

Prompt:

```text
创建一个图书馆管理系统
```

Expected:

- `apps/api` starts an OpenCode run.
- Logs stream into the UI.
- Files appear only after OpenCode writes them.
- No pre-seeded fake files appear before the agent writes them.

- [ ] **Step 3: Create or select ApiFlow-compatible workflow**

Use a workflow graph with only:

```text
user_input
http_request
```

or a single `user_input` node for the first smoke run.

Expected export result:

```text
DSL contains EVAL or HTTP.
Unsupported nodes array is empty.
```

- [ ] **Step 4: Run workflow**

Click the workflow run action.

Expected API response:

```json
{
  "runtime": "apiflow",
  "externalRunId": "apiflow-...",
  "status": "queued"
}
```

Expected sidecar behavior:

- Sidecar writes `main.groovy` under its runtime workspace.
- Sidecar calls `FlowEngine.reLoad()`.
- Sidecar calls `FlowEngine.execute("main.groovy", input)`.
- Run eventually becomes `succeeded` or `failed` with a clear error.

- [ ] **Step 5: Verify UI status propagation**

Expected:

- Run history displays the workflow run.
- Status changes from `queued` to `running` to terminal.
- If external source extension is complete, task-level events can update nodes.
- If extension is not complete, node-level status remains hidden.

---

## Task 5: Verify Direct Sidecar API

**Files:**
- No code changes unless a bug is found

- [ ] **Step 1: Start a run with PowerShell**

Run:

```powershell
$body = @{
  workflowId = "manual-smoke"
  workflowName = "Manual Smoke"
  dsl = @"
task_get_token = EVAL {
    "token-" + input.name
}

start {
    run task_get_token
}
"@
  input = @{ name = "luban" }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Method Post `
  -Uri http://127.0.0.1:9527/api/apiflow/workflows/manual-smoke/runs `
  -ContentType "application/json" `
  -Body $body
```

Expected:

```text
externalRunId starts with apiflow-
status is queued or running
```

- [ ] **Step 2: Poll run**

Run:

```powershell
Invoke-RestMethod http://127.0.0.1:9527/api/apiflow/runs/<externalRunId>
```

Expected:

```text
status = succeeded
result = token-luban
```

- [ ] **Step 3: Read events**

Run:

```powershell
Invoke-RestMethod "http://127.0.0.1:9527/api/apiflow/runs/<externalRunId>/events?after=0"
```

Expected before external source extension:

```text
run.queued
run.running
run.succeeded
```

Expected after external source extension:

```text
run.* and task.* events
```

---

## Task 6: Regression And Safety Gates

**Files:**
- No code changes unless a bug is found

- [ ] **Step 1: Run all main repo checks**

Run:

```powershell
cd "$COURSE_ROOT\ai-app-generator-mvp\.worktrees\implement-mvp"
npm.cmd run check:repo-boundary
npm.cmd run test
npm.cmd run typecheck
```

Expected: all pass.

- [ ] **Step 2: Confirm no ApiFlow source is staged**

Run:

```powershell
git status --short
git diff --cached --name-only
```

Expected:

```text
No staged path includes 20250725_apiFlow, apiFlow-core, apiFlow-control, or apiFlow-spring.
```

- [ ] **Step 3: Commit main repo fixes only**

If bugs were fixed during integration:

```powershell
git add apps packages docs scripts package.json .gitignore
git commit -m "fix: stabilize apiflow sidecar integration"
```

- [ ] **Step 4: Commit external ApiFlow fixes separately**

If engine bugs were fixed:

```powershell
cd "$COURSE_ROOT\20250725_apiFlow"
git status --short
git add apiFlow-core
git commit -m "fix: stabilize apiflow execution events"
```

Do not mix these commits.

---

## Acceptance Criteria

- `apps/web`, `apps/api`, `apps/apiflow-sidecar`, and OpenCode can run together.
- First prompt starts from the browser and reaches OpenCode.
- Workflow run starts from the browser and reaches real ApiFlow `FlowEngine`.
- Sidecar returns stable `externalRunId`.
- API persists the external run ID.
- UI shows terminal run status.
- ApiFlow source remains outside the main repo and is not staged.
- Main repo checks pass.

## Self-Review

- The plan tests the real service process, not only compilation.
- It covers direct sidecar API and browser-driven user flow.
- It keeps main project and external source commits separate.
- It supports run-level acceptance before task-level engine instrumentation is complete.
