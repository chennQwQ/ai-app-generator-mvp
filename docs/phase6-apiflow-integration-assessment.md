# Phase 6 ApiFlow Integration Assessment

Date: 2026-06-23

## Summary

Phase 5 is complete: Studio can persist a visual workflow graph, run it with the local `WorkflowExecutor`, store `workflow_runs`, and stream workflow status events.

The current ApiFlow course code can support a narrow Phase 6 vertical slice as an execution kernel, but it is not enough by itself for the full Phase 6 acceptance criteria. It needs an Adapter seam, an export format, a runtime control plane, and structured execution events before it can be treated as the Studio workflow runtime.

Recommended decision: use ApiFlow behind a Studio-owned `ApiFlowRuntimeAdapter`. Do not make the React/Node Studio depend directly on Groovy DSL internals.

## ApiFlow Capabilities Found

ApiFlow is currently shaped as an in-process Java/Groovy DSL engine.

- `FlowEngine` loads Groovy DSL files from `dslPath/api`, reloads DSL classes, registers triggers/apps/task suppliers, and executes a flow through `execute(flowPath, input, attachInput)`.
- `AbstractScript` exposes DSL task constructors: `HTTP`, `EVAL`, `EACH`, `ABORT`, `BOOLE`, and `SWITCH`.
- `AbstractScript` exposes execution directives: `start`, `run`, `when`, and `async`.
- `TaskSupplier` allows custom task types to be registered behind the DSL missing-method path.
- `AbstractTask` already has useful internal task fields: type, name, async, result, runtimeError, state, and useTime.
- `InvokeTask` supports retry and basic error policies.
- `WebHookTrigger` and `ApiFlowServlet` can invoke flows through HTTP-trigger matching.
- `CronExecutorService` and `AsyncTaskExecutorService` provide trigger scheduling and async task submission.

The `apiFlow-control` module has no production control-plane code. The `apiFlow-spring` module is only a Spring Boot shell. There is no existing REST runtime service for workflow import, execution, status lookup, cancellation, or event streaming.

## Phase 6 Fit

| Phase 6 requirement | Current support | Assessment |
| --- | --- | --- |
| Define workflow export format | No native JSON workflow import/export format | Must add Studio-owned export schema and compiler |
| Map Studio nodes to ApiFlow nodes | Partial | `user_input` can map to `input`/`EVAL`; `agent_generation` and `shell_command` are not native ApiFlow tasks |
| Add execution Adapter seam | No Studio seam yet | Must add TypeScript Interface and at least fake/http adapters |
| Add backend route to trigger ApiFlow execution | ApiFlow has webhook servlet, not Studio control route | Must add backend route and/or Java sidecar endpoint |
| Persist external execution IDs and statuses | ApiFlow has no durable run id/status protocol | Must extend `workflow_runs` with external run metadata or add runtime-run table |
| Surface ApiFlow logs/events in Studio event stream | ApiFlow logs through SLF4J; task state is internal | Must add structured event bridge |
| Simple workflow executes through ApiFlow | Possible for limited node subset | Accept only constrained v1 graph until missing tasks are added |

## Main Gaps

### 1. No deep runtime Interface

Current `FlowEngine.execute(...)` returns only a final result. The caller does not get a stable run id, task lifecycle events, cancellation handle, or structured error envelope. For Studio, that makes the Module too shallow: every caller would need to know Groovy file paths, reload timing, exception detail formats, and log parsing.

Needed depth:

- `ExecutionContext`: run id, flow path, input, project/workflow identity, cancellation token, metadata.
- `ExecutionResult`: run id, status, result, error, started/finished timestamps.
- `FlowExecutionListener`: flow started/succeeded/failed/cancelled.
- `TaskExecutionListener`: task started/succeeded/failed/logged with task id, node id, type, duration, result/error summary.

### 2. No control plane

`ApiFlowServlet` handles inbound webhook triggers, but Phase 6 needs Studio to control workflow lifecycle:

- register or update exported workflow definition
- trigger a run
- query run status
- receive or poll run events
- cancel a run

This should live in a Java sidecar or runtime service, not inside the TypeScript API process.

### 3. Missing Studio node coverage

Current Studio node types are:

- `user_input`
- `agent_generation`
- `shell_command`

ApiFlow native tasks cover HTTP, script/eval, branching, collection pipelines, abort, and async. It does not natively execute OpenCode/Agent generation or shell commands.

Phase 6 v1 should not claim full graph compatibility. It should either:

- support only ApiFlow-compatible nodes and reject unsupported graphs during export, or
- add custom ApiFlow tasks for `AGENT` and `SHELL`.

The safer v1 is limited-node export. Shell and Agent tasks have workspace/security implications and should stay behind existing Studio modules until there is a clear sandbox model.

### 4. No structured event bridge

ApiFlow has internal task state and SLF4J logs, but Studio needs WebSocket events already shaped like workflow run and node status updates. Log scraping would be brittle and would leak runtime internals.

Needed bridge:

- ApiFlow task events -> Studio `workflow.node.status`
- ApiFlow run events -> Studio `workflow.run.status`
- ApiFlow log events -> either new `workflow.run.log` event or stored run event rows

### 5. No cancellation semantics

The current `WorkflowExecutor.cancel(...)` marks a run cancelled in SQLite. ApiFlow async execution does not expose a cancellation token, and HTTP tasks do not check cancellation. Phase 6 can initially support best-effort cancellation at the Studio layer, but production-quality cancellation needs runtime support.

## Recommended Architecture

Keep Studio as the owner of project/workflow state and add a narrow ApiFlow Adapter seam.

```ts
export interface ApiFlowRuntimeAdapter {
  exportWorkflow(input: ApiFlowExportInput): Promise<ApiFlowExportResult>;
  startRun(input: ApiFlowRunInput): Promise<ApiFlowExternalRun>;
  getRun(externalRunId: string): Promise<ApiFlowExternalRun>;
  cancelRun(externalRunId: string): Promise<void>;
}
```

Initial adapters:

- `FakeApiFlowRuntimeAdapter`: deterministic tests and UI progress before Java sidecar is ready.
- `HttpApiFlowRuntimeAdapter`: calls the Java ApiFlow sidecar.

Recommended Java sidecar endpoints:

- `POST /api/apiflow/workflows`: accept exported bundle, write generated DSL, reload engine.
- `POST /api/apiflow/workflows/{workflowId}/runs`: execute a flow and return external run id.
- `GET /api/apiflow/runs/{externalRunId}`: return status/result/error summary.
- `GET /api/apiflow/runs/{externalRunId}/events`: return event list or SSE stream.
- `POST /api/apiflow/runs/{externalRunId}/cancel`: request cancellation.

## Workflow Export Strategy

Studio should own a versioned export schema, then compile it to ApiFlow Groovy DSL.

Minimum export bundle:

```json
{
  "version": 1,
  "projectId": "project-id",
  "workflowId": "workflow-id",
  "nodes": [],
  "edges": [],
  "entryNodeIds": [],
  "unsupportedNodes": []
}
```

ApiFlow-compatible v1 mapping:

| Studio node | ApiFlow mapping | V1 policy |
| --- | --- | --- |
| `user_input` | `input` or `EVAL` result | Supported |
| `agent_generation` | custom `AGENT` task or Studio-owned execution | Reject in ApiFlow v1 |
| `shell_command` | custom `SHELL` task or Studio-owned execution | Reject in ApiFlow v1 |
| future `http_request` | `HTTP` task | Supported once node exists |
| future condition node | `BOOLE`/`SWITCH` + `when` | Supported once node exists |

## Suggested Phase 6 Work Breakdown

### Phase 6.1: Contract and Adapter seam

- Add shared ApiFlow export/run types.
- Add `ApiFlowRuntimeAdapter` Interface in `apps/api`.
- Add fake adapter and tests.
- Add env flag such as `WORKFLOW_RUNTIME=local|apiflow`.

Acceptance:

- Existing Phase 5 local workflow runs still pass.
- ApiFlow adapter can be selected without changing route callers.

### Phase 6.2: Export validation and compiler

- Add export endpoint or service method for saved workflows.
- Reject unsupported nodes with client-safe errors.
- Generate deterministic ApiFlow DSL for supported graphs.
- Store generated bundle under project/runtime artifacts, not in course source files.

Acceptance:

- A saved workflow exports to a stable, versioned bundle.
- Unsupported nodes produce actionable validation errors.

### Phase 6.3: Java sidecar wrapper

- Add a small runtime service around `FlowEngine`.
- Load generated DSL directory.
- Implement run/status endpoints.
- Return structured success/failure envelopes.

Acceptance:

- TypeScript API can start one ApiFlow run and persist the external run id.

### Phase 6.4: Event and status bridge

- Add ApiFlow structured listeners or a wrapper event collector.
- Map ApiFlow events to Studio workflow events.
- Persist status transitions and expose them through the existing WebSocket path.

Acceptance:

- Studio run history shows ApiFlow status.
- Node-level events appear in the workflow canvas/status panel.

### Phase 6.5: Node coverage expansion

- Add Studio `http_request` node and map it to ApiFlow `HTTP`.
- Add condition node and map it to `BOOLE`/`SWITCH`.
- Decide whether `agent_generation` and `shell_command` remain Studio-owned or become custom ApiFlow tasks.

Acceptance:

- A simple ApiFlow-native workflow can run end to end through Studio.

## ApiFlow Optimizations Needed

If we are allowed to optimize ApiFlow itself, prioritize these changes:

1. Make execution lifecycle public.
   Add public `FlowExecutionListener` and `TaskExecutionListener` interfaces instead of relying on package-private `EngineListener` and logs.

2. Add run context.
   Pass an `ExecutionContext` through `FlowEngine.execute(...)` and `AbstractScript.run(...)` so every task can emit run-correlated events.

3. Add task/node metadata.
   Generated DSL should bind Studio node ids to ApiFlow task names, so Studio can map runtime events back to canvas nodes.

4. Add cancellation.
   Provide a cancellation token and check it before/after each task and during long-running HTTP/async operations.

5. Add runtime DTOs.
   Provide `ExecutionResult`, `TaskEvent`, and `RuntimeError` DTOs with stable JSON serialization.

6. Add sidecar service.
   Implement workflow registration, run start, status lookup, events, and cancellation. `ApiFlowServlet` should remain webhook-specific.

7. Defer HTTP client modernization.
   `commons-httpclient:3.1` is old, but replacing it is not required for the first Phase 6 vertical slice. Encapsulate it behind the existing `HttpTaskHand` first.

## Development Rule

Do not edit or commit course root files directly. Treat the course ApiFlow source as reference/upstream. If Phase 6 needs ApiFlow code changes, copy or vendor the needed runtime module inside the isolated project repo, or maintain it as a separate explicit dependency.
