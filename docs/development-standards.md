# Development Standards

## Repository Boundary

All source, docs, plans, Git commits, and generated project documentation belong inside:

```powershell
D:\doc\code\apiFlow项目课程\ai-app-generator-mvp
```

Do not stage or commit files from the parent course directory. Parent videos, PDFs, archives, screenshots, extracted frames, and reference documents are external source material, not repository content.

Before committing, always run:

```powershell
git status --short --untracked-files=all
```

Confirm every staged file is under this repository.

## Branch And Worktree Policy

- Use a feature branch or worktree for implementation work.
- Current active branch pattern: `implement-mvp`.
- Keep commits small enough to review.
- Do not rewrite user changes or reset the worktree unless explicitly instructed.
- Do not commit generated `storage/`, `workspaces/`, `dist/`, or dependency folders.

## Development Workflow

Use TDD for behavior changes:

1. Write the failing test.
2. Run the focused test and confirm the failure is for the expected reason.
3. Implement the smallest code change.
4. Run the focused test and confirm it passes.
5. Run broader checks before commit.

For larger tasks, use subagent-driven development:

1. Implement one task.
2. Request spec compliance review.
3. Fix spec gaps.
4. Request code quality review.
5. Fix Critical and Important issues.
6. Run verification.
7. Commit.

## Verification Commands

Run from repository root:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
git diff --check
```

`npm.cmd` is preferred in Windows PowerShell when script execution policy blocks `npm.ps1`. `npm test`, `npm run typecheck`, and `npm run build` are fine in shells where `npm` resolves normally.

## Code Style

- TypeScript strict mode stays enabled.
- Prefer explicit domain types in `packages/shared`.
- Keep backend modules small and service-oriented.
- Keep route handlers thin; put behavior in services.
- Do not add abstractions until they remove real duplication or clarify ownership.
- Keep comments rare and useful.
- Do not hardcode absolute machine paths except in docs/examples.
- Do not hardcode model providers or model names.

## API Error Handling

Routes should return client-safe error messages.

Expected patterns:

- validation error: `400`
- missing project: `404`
- active run conflict: `409`
- unexpected internal failure: `500` with generic message

Do not leak raw filesystem paths, SQLite internals, provider tokens, or prompt secrets into API responses.

## Agent Integration Rules

- The generator owns orchestration, not model/provider config.
- OpenCode owns provider, model, API keys, and billing configuration.
- Do not add `--model` to OpenCode commands in MVP.
- Do not add provider credentials to `.env.example`.
- Run Agent processes with `cwd` set to the project workspace.
- Record auditable shell/file operations.

## File And Workspace Safety

File APIs must reject:

- absolute paths
- `..` traversal
- symlink escape
- `.env`
- `.git`
- `node_modules`
- `dist`
- cache/coverage folders
- oversized files

New file API behavior must include negative tests.

## Testing Expectations

Backend:

- service tests for business rules
- route tests for HTTP behavior
- lifecycle tests for cancellation, shutdown, preview process handling
- schema tests for DB tables

Frontend:

- API mock tests for user workflows
- template selection tests
- loading/error/empty states
- preview and file viewer behavior

Shared package:

- runtime tests for helpers and exported definitions
- schema-like assertions for tool parameters

## Documentation Expectations

Update docs when a change affects:

- product scope
- phase status
- setup commands
- environment variables
- API surface
- data model
- developer workflow
- manual acceptance checks

The phase source of truth is `docs/phase-roadmap.md`.

Detailed implementation plans remain under `docs/superpowers/plans/`.

## Commit Message Style

Use concise conventional-style messages:

- `feat: add vue vite template`
- `fix: preserve cancelled run status`
- `test: cover template selection payload`
- `docs: add developer onboarding guide`
- `chore: configure workspace scripts`

## Pull Request / Review Checklist

- Product requirement covered.
- Tests were written before production code for behavior changes.
- Focused tests passed.
- Full `npm.cmd test` passed.
- `npm.cmd run typecheck` passed.
- `npm.cmd run build` passed.
- `git diff --check` passed.
- Docs updated if behavior/setup changed.
- No parent course files staged.

