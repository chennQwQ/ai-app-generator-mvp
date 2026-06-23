# Phase Roadmap And Status

This file is the phase-level source of truth for new developers. Detailed implementation steps live in `docs/superpowers/plans/`; this file summarizes what each phase is for, what is already done, and what remains.

## Status Legend

- Done: implemented, tested, and committed or ready to commit in the active branch.
- In Progress: implementation exists but still needs verification, review, or commit.
- Planned: scoped but not implemented.
- Deferred: intentionally out of MVP scope.

## Phase 0: Repository Isolation And Planning

Status: Done.

Goal: create a clean project boundary so parent course files are not committed.

Done:

- Created `ai-app-generator-mvp` as the isolated repo directory.
- Added README boundary rules.
- Added design spec in `docs/superpowers/specs/2026-06-21-ai-app-generator-mvp-design.md`.
- Added initial implementation plan in `docs/superpowers/plans/2026-06-21-ai-app-generator-mvp.md`.

Developer handoff:

- Always run Git commands from the repo/worktree, not the parent course directory.
- Parent videos/docs are reference material only.

## Phase 1: Local MVP Loop

Status: Done.

Goal: prove the basic local Studio loop with a fake Agent.

Done:

- npm workspace monorepo.
- Shared TypeScript package.
- Fastify API skeleton.
- SQLite schema.
- React Vite starter template.
- Project create/list/read flow.
- Conversation/message/run/log persistence.
- Fake Agent runner.
- WebSocket event bus and project subscription.
- File tree and file content API.
- Preview manager and preview routes.
- React Studio shell for projects, prompts, logs, files, and preview.
- Local development docs.

Acceptance:

- User can create a project.
- User can send a prompt.
- Fake Agent writes generated app content.
- Logs and status stream to UI.
- Files can be inspected.
- Preview can be started.

Reference plan:

- `docs/superpowers/plans/2026-06-21-ai-app-generator-mvp.md`

## Phase 2: OpenCode Integration

Status: Done.

Goal: connect the generation loop to the user's configured OpenCode install.

Done:

- Added `AGENT_PROVIDER=opencode`.
- Added `OpenCodeAgentRunner`.
- Runs OpenCode with explicit argument array, not shell-concatenated user prompt.
- Supports Windows `.cmd` shim resolution.
- Adds runner health check.
- Keeps model provider configuration outside this app.
- Does not pass `--model`.
- Supports canceling OpenCode process.

Important decision:

- DeepSeek is configured by the user in OpenCode. The generator only invokes OpenCode.

Acceptance:

- Fake provider remains deterministic for tests.
- OpenCode provider can be selected by environment variable.
- Missing or broken OpenCode command reports a setup failure instead of crashing the API.

## Phase 3: Better Studio UX

Status: Done.

Goal: make the Studio usable for repeated local development.

Done:

- Project delete endpoint and UI.
- Monaco file editor wrapper.
- Terminal-style log panel.
- Preview iframe toggle.
- Loading skeleton.
- Dismissible error banner with retry behavior.
- Run history and cancel controls.
- More complete frontend tests.
- Local development docs updated for Phase 3 features.

Acceptance:

- User can inspect code in Monaco.
- User can see preview inside the Studio.
- User can delete projects safely.
- User gets useful loading/error UI.
- Active run can be canceled.

Reference plan:

- `docs/superpowers/plans/2026-06-22-ai-app-generator-phase3.md`

## Phase 4: Templates, Tool Definitions, And Audit

Status: Done.

Goal: support multiple starter templates and expose auditable tool-level generation data.

Done:

- Added `templates/vue-vite`.
- Added `TemplateService`.
- Added `GET /api/templates`.
- Replaced single-template config with `TEMPLATES_DIR`.
- Added template selection to project creation API.
- Added template dropdown to the web create-project form.
- Added shared `TemplateMeta`.
- Added shared `ToolDefinition` and `toolDefinitions`.
- Added `audit_logs` table.
- Added `AuditService`.
- Added `GET /api/projects/:projectId/audit`.
- Added fake `file_write` audit record.
- Added lifecycle guard so cancelled runs are not overwritten by late completion.
- Added audit close guard so late writes after app shutdown do not hit a closed DB.
- Made fake runner write `src/App.vue` for Vue projects and `src/App.tsx` for React projects.
- Expanded tests for template selection, Vue/React generated files, audit logs, tool schema, cancellation, and shutdown.

Acceptance:

- `GET /api/templates` returns `react-vite` and `vue-vite`.
- React project creation copies `src/App.tsx`.
- Vue project creation copies `src/App.vue`.
- Web template dropdown sends the selected template.
- Shared tool schema tests verify required/default fields.
- Fake Agent audit records include schema-complete `file_write` parameters.
- Vue fake run changes `src/App.vue`, not an unused React file.

Reference plan:

- `docs/superpowers/plans/2026-06-23-ai-app-generator-phase4.md`

## Phase 5: Visual Workflow Builder

Status: Done.

Goal: move from one prompt-to-app flow toward a visible workflow graph.

Done:

- Added `workflows` and `workflow_runs` DB tables.
- Added `WorkflowService` with CRUD, graph validation (edge references, self-loops, node type checks, ownership checks).
- Added `WorkflowExecutor` with topological sort, sequential node execution, async shell commands, and WebSocket event publishing.
- Added 6 REST endpoints: list/create/get/update/delete/run workflows.
- Added React Flow canvas with 3 custom node types (user_input, agent_generation, shell_command).
- Added workspace tab switching (Files | Workflow | Preview).
- Added workflow list with create/delete/run controls.
- Added auto-save on graph changes (800ms debounce).
- Added WebSocket events for workflow run and node status.

Acceptance:

- User can create and save a workflow graph.
- User can run a simple graph that starts an Agent run.
- Invalid graphs show client-safe validation errors.
- Workflow runs stream status via WebSocket.

Reference plan:

- `docs/superpowers/plans/2026-06-23-ai-app-generator-phase5.md`

## Phase 6: ApiFlow Runtime Integration

Status: Planned.

Goal: connect the visual workflow model to the ApiFlow execution backend.

Planned scope:

- Define workflow export format.
- Map Studio nodes to ApiFlow nodes.
- Add execution adapter boundary.
- Add backend route to trigger ApiFlow execution.
- Persist external execution IDs and statuses.
- Surface ApiFlow logs/events in the Studio event stream.

Risks:

- Runtime contract may require Java/Groovy-specific validation.
- Error mapping must not leak internal runtime paths or secrets.
- Need clear ownership between Studio orchestration and ApiFlow engine.

Acceptance:

- A saved workflow can be exported to ApiFlow-compatible definition.
- A simple workflow can execute through ApiFlow.
- Logs and status are visible in the same run history model.

## Phase 7: Deployment Model

Status: Planned.

Goal: make generated apps shareable beyond local preview.

Planned scope:

- Build generated apps.
- Store build artifacts.
- Add local static hosting route or NGINX path routing.
- Add deployment status model.
- Add deploy/rollback commands.
- Add per-project preview/deploy URLs.

Acceptance:

- User can build a generated project.
- User can serve the built output from a stable local URL.
- Failed builds preserve logs and do not remove the last good artifact.

## Phase 8: Multi-User And Production Hardening

Status: Deferred.

Goal: prepare for hosted use.

Deferred scope:

- user accounts
- project ownership
- provider credential vault
- billing/quotas
- containerized Agent sandbox
- per-workspace OS isolation
- audit export
- deployment access control

Do not start this phase until local single-user generation, workflow execution, and deployment semantics are stable.
