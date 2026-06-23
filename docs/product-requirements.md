# Product Requirements

## Product Positioning

This project is a local AI app generator studio. A user describes an app in natural language, the backend starts a configured code Agent inside an isolated project workspace, the frontend streams progress, and the user can inspect files and start a local preview.

The MVP is not a cloud SaaS product yet. It is a local-first development platform that proves the generation loop before adding visual workflow, ApiFlow runtime integration, accounts, billing, or deployment infrastructure.

## Target Users

- Solo builder: wants to turn one sentence into a runnable local frontend app.
- Course/demo user: wants to reproduce the video project flow locally and inspect how the Agent changes files.
- Developer/operator: wants to use OpenCode with their own provider configuration, such as DeepSeek, without the generator owning model keys.
- Future team member: needs clear modules, tests, docs, and phase boundaries to implement one feature without reading the full chat history.

## Core User Journey

1. User opens the Web Studio.
2. User creates a project and chooses a template.
3. Backend copies the selected template into `workspaces/{projectId}`.
4. User submits a prompt.
5. Backend creates a conversation message and one Agent run.
6. Agent runner executes inside only that project workspace.
7. Backend streams status and logs over WebSocket.
8. User inspects generated files.
9. User starts a local preview server.
10. User reviews audit history for tool calls.

## Goals

- Create projects from built-in templates.
- Support React Vite and Vue Vite starters.
- Keep Agent model/provider configuration outside this app and inside OpenCode.
- Persist projects, conversations, messages, runs, logs, and audit records.
- Stream run status and logs to the browser.
- Let the user inspect file trees and file content safely.
- Let the user start and stop local preview servers.
- Keep the repo boundary clean: no parent course videos, PDFs, archives, screenshots, or extracted frames are committed.

## Non-Goals

- No hosted multi-tenant product in MVP.
- No production sandboxing, quotas, or billing in MVP.
- No hardcoded model provider or model name.
- No direct ownership of DeepSeek/OpenAI/Anthropic/Gemini credentials.
- No full ApiFlow Java/Groovy execution backend before the generation loop is stable.
- No template marketplace before the built-in template contract is stable.

## Functional Requirements

### Project Management

- User can list projects.
- User can create a project with a name.
- User can select a template during project creation.
- User can delete a project.
- Delete removes the workspace directory and associated database records.

### Templates

- API exposes `GET /api/templates`.
- Template metadata includes `id`, `name`, and `description`.
- `react-vite` is the default template.
- `vue-vite` is available and creates `src/App.vue`.
- Unknown template IDs are rejected with a client-safe error.

### Agent Runs

- One active run is allowed per project.
- User message starts an Agent run.
- Fake runner exists for deterministic local development and tests.
- OpenCode runner calls the configured `opencode` command without hardcoding `--model`.
- Run cancellation marks active runs as `cancelled`.
- Late background completion must not overwrite a terminal run status.

### Files

- User can list a workspace file tree.
- User can read safe UTF-8 file content.
- File API blocks path traversal, absolute paths, ignored directories, `.env`, `.git`, `node_modules`, build output, cache folders, and large files.

### Preview

- User can start a preview for a project.
- Preview manager allocates local ports from `PREVIEW_PORT_START`.
- Preview status and URL are persisted on the project summary.
- User can stop or replace an existing preview.

### Audit

- Tool calls are recorded in `audit_logs`.
- Fake file writes record `file_write` with `path` and `content`.
- OpenCode shell execution records a `shell` audit entry.
- API exposes `GET /api/projects/:projectId/audit`.

## Acceptance Criteria

- `npm test` passes.
- `npm run typecheck` passes.
- `npm run build` passes.
- `git diff --check` exits 0.
- A React project contains `src/App.tsx` and not `src/App.vue`.
- A Vue project contains `src/App.vue` and not `src/App.tsx`.
- Fake Agent updates the template-relevant app entry file.
- Audit history includes schema-complete `file_write` parameters.
- OpenCode integration delegates provider/model selection to the user's OpenCode config.

## Product Risks

- Local Agent execution is powerful; production isolation must be containerized or OS-user isolated before external users.
- Preview processes can consume ports and resources; lifecycle cleanup must remain tested.
- OpenCode output format may evolve; the runner should keep parsing isolated.
- Multi-template support should eventually persist template identity instead of relying only on copied file structure.

