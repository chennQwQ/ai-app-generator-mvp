# Implementation Guide

## Repository Layout

```text
apps/
  api/      Fastify API, SQLite persistence, Agent orchestration, preview, file routes
  web/      React Studio UI
packages/
  shared/   Shared TypeScript domain types, event types, template/tool/audit types
templates/
  react-vite/
  vue-vite/
docs/
  superpowers/
    specs/  Original design specs
    plans/  Detailed implementation plans
```

Runtime output directories such as `storage/`, `workspaces/`, `dist/`, `node_modules/`, and generated project files must not be committed.

## Runtime Flow

```text
Web Studio
  -> POST /api/projects
  -> empty workspace created; selected template stored as private metadata
  -> POST /api/projects/:projectId/messages
  -> ConversationService creates user message and run
  -> AgentRunner runs fake/OpenCode in workspace
  -> EventBus publishes run.status and run.log
  -> WebSocket sends events to browser
  -> FileService reads generated files
  -> PreviewManager starts local Vite server
```

## Backend Module Responsibilities

### `config.ts`

Loads environment variables and resolves paths.

Important variables:

- `APP_ROOT`: repository root override.
- `STORAGE_DIR`: SQLite storage directory.
- `WORKSPACE_DIR`: generated project workspace root.
- `TEMPLATES_DIR`: built-in template root.
- `AGENT_PROVIDER`: `fake` or `opencode`.
- `OPENCODE_COMMAND`: command name/path, default `opencode`.
- `OPENCODE_AGENT`: configured OpenCode agent, default `build`.
- `OPENCODE_RUN_FORMAT`: currently `json`.
- `PREVIEW_HOST`, `PREVIEW_PORT_START`: local preview settings.

Do not reintroduce `TEMPLATE_DIR`; multi-template code uses `TEMPLATES_DIR`.

### `db/schema.ts`

Creates the SQLite schema:

- `projects`
- `conversations`
- `messages`
- `agent_runs`
- `agent_logs`
- `audit_logs`

Schema changes require tests in `apps/api/test/database.test.ts` and migration/backward-compat notes if existing data would be affected.

### `projects/project-service.ts`

Owns project lifecycle:

- create an empty workspace
- persist the selected template as private workspace metadata
- create project and conversation rows in one transaction
- list/read/delete projects
- update preview state
- resolve workspace path

Template resolution is delegated to `TemplateService`.

### `templates/template-service.ts`

Owns template metadata and directory resolution.

When adding a template:

1. Add a directory under `templates/{template-id}`.
2. Add metadata to `TemplateService`.
3. Add template existence tests.
4. Add project creation tests that assert an empty visible workspace and template-specific generation behavior.
5. Update `docs/phase-roadmap.md` if this belongs to a phase.

### `conversations/conversation-service.ts`

Owns messages, agent runs, logs, active-run checks, and run status updates.

Rules:

- one active run per project
- terminal statuses are `succeeded`, `failed`, and `cancelled`
- cancellation must not be overwritten by late background results
- log persistence and WebSocket publishing are best-effort after app shutdown

### `agent/agent-runner.ts`

Contains two providers:

- `FakeAgentRunner`: deterministic test/local runner.
- `OpenCodeAgentRunner`: real runner that spawns OpenCode.

OpenCode integration contract:

- call OpenCode inside the project workspace
- pass `--dir`, `--agent`, and `--format`
- do not pass `--model`
- do not store provider API keys
- let the user's OpenCode config decide DeepSeek/OpenAI/Anthropic/Gemini/local model settings

Fake runner behavior:

- if `src/App.vue` exists, write `src/App.vue`
- otherwise if private template metadata is `vue-vite`, write `src/App.vue`
- otherwise write `src/App.tsx`
- record `file_write` audit parameters with both `path` and `content`

### `audit/audit-service.ts`

Persists tool audit records.

The service has a `close()` guard. After shutdown, late audit writes return `null` instead of writing to a closed DB.

### `events/event-bus.ts`

In-process project event pub/sub for WebSocket consumers.

Event types are defined in `packages/shared/src/index.ts`.

### `files/file-service.ts`

Owns safe workspace file access.

Safety requirements:

- reject absolute paths
- reject `..`
- reject ignored directories/files, including private `.ai-template` metadata
- reject symlink escape
- reject directories as content reads
- reject files over the configured UI limit

### `preview/preview-manager.ts`

Starts/stops local dev servers and publishes preview status.

Preview process changes must include tests for:

- port allocation
- start success
- early exit/error
- replacement preview
- stop behavior

## Frontend Module Responsibilities

### `apps/web/src/api.ts`

Typed API client for Studio calls. Add new endpoints here before using them in components.

### `apps/web/src/App.tsx`

Main Studio state and layout:

- project list
- create project form
- template dropdown
- messages
- run history/cancel
- file tree
- Monaco editor
- preview controls and iframe
- audit/runs display hooks

Keep this file from growing indefinitely. New feature panels should move into `apps/web/src/components/` when they gain independent state or tests.

### `apps/web/src/components/*`

Reusable UI components:

- `Editor.tsx`
- `ErrorBanner.tsx`
- `LoadingSkeleton.tsx`

## API Surface

### Projects

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:projectId`
- `DELETE /api/projects/:projectId`

### Templates

- `GET /api/templates`

### Messages and Runs

- `GET /api/projects/:projectId/messages`
- `POST /api/projects/:projectId/messages`
- `GET /api/projects/:projectId/runs`
- `POST /api/projects/:projectId/runs/:runId/cancel`

### Files

- `GET /api/projects/:projectId/files`
- `GET /api/projects/:projectId/files/content?path=...`

### Preview

- `POST /api/projects/:projectId/preview/start`
- `POST /api/projects/:projectId/preview/stop`

### Audit

- `GET /api/projects/:projectId/audit`

### WebSocket

- `GET /ws?projectId={projectId}`

## Shared Types

`packages/shared/src/index.ts` is the contract between API and web.

Current shared contracts include:

- project/message/run/log/file/preview types
- WebSocket project events
- template metadata
- tool definitions
- audit log records

When changing shared types, update tests in `packages/shared/src/index.test.ts` and run root typecheck.
