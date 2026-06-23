# Developer Onboarding

## First 15 Minutes

1. Open the repository/worktree:

```powershell
cd <your-ai-app-generator-mvp-checkout>
```

On the current maintainer machine, the active worktree is:

```powershell
cd D:\doc\code\apiFlow项目课程\ai-app-generator-mvp\.worktrees\implement-mvp
```

2. Confirm boundary:

```powershell
git status --short --untracked-files=all
```

3. Install dependencies if needed:

```powershell
npm.cmd install
```

4. Run verification:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
```

5. Read these files:

- `docs/product-requirements.md`
- `docs/implementation-guide.md`
- `docs/development-standards.md`
- `docs/phase-roadmap.md`
- `docs/local-development.md`

## Where To Start By Task Type

### Backend API Task

Read:

- `apps/api/src/server.ts`
- route file under `apps/api/src/routes/`
- service file under `apps/api/src/`
- matching test under `apps/api/test/`

Run:

```powershell
npm.cmd test --workspace apps/api
npm.cmd run typecheck --workspace apps/api
```

### Frontend Studio Task

Read:

- `apps/web/src/App.tsx`
- `apps/web/src/api.ts`
- relevant component in `apps/web/src/components/`
- `apps/web/src/App.test.tsx`

Run:

```powershell
npm.cmd test --workspace apps/web
npm.cmd run typecheck --workspace apps/web
```

### Shared Contract Task

Read:

- `packages/shared/src/index.ts`
- `packages/shared/src/index.test.ts`

Run:

```powershell
npm.cmd test --workspace packages/shared
npm.cmd run typecheck --workspace packages/shared
```

### Template Task

Read:

- `templates/react-vite/`
- `templates/vue-vite/`
- `apps/api/src/templates/template-service.ts`
- `apps/api/test/template.test.ts`
- `apps/api/test/projects.test.ts`

Run:

```powershell
npm.cmd test --workspace apps/api -- template.test.ts projects.test.ts
```

## Local Runtime

Fake Agent mode:

```powershell
$env:AGENT_PROVIDER = "fake"
npm.cmd run dev:api
```

Second terminal:

```powershell
npm.cmd run dev:web
```

Open:

```text
http://127.0.0.1:5173
```

OpenCode mode:

```powershell
$env:AGENT_PROVIDER = "opencode"
$env:OPENCODE_COMMAND = "opencode"
$env:OPENCODE_AGENT = "build"
npm.cmd run dev:api
```

OpenCode must already be installed and configured by the user. This repository must not store model provider secrets.

## Common Pitfalls

- Running Git from the parent course directory.
- Reintroducing `TEMPLATE_DIR` instead of using `TEMPLATES_DIR`.
- Adding `--model` to OpenCode commands.
- Writing React files for Vue projects.
- Recording audit `file_write` without `content`.
- Closing the SQLite DB before async background run cleanup finishes.
- Trusting a partial test run before commit.

## Definition Of Done

- Requirement is linked to a phase in `docs/phase-roadmap.md`.
- Tests cover the behavior.
- Full verification passes.
- Docs are updated.
- Code review has no Critical or Important issues.
- Commit contains only repo files.
