# AI App Generator Phase 3 Implementation Plan — Better Studio UX

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Web Studio UX per the design spec Phase 3: project navigation improvements, Monaco file editor, terminal-style log panel, preview iframe embedding, and consistent loading/empty/error states.

**Architecture:** No new backend modules. All changes are within existing `apps/web` (React frontend) and one new route in `apps/api` (project delete). The monorepo boundary, npm workspaces, and existing conventions remain unchanged.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Fastify (existing), plus `@monaco-editor/react`.

---

## File Structure (phase 3 changes only)

Files to create:
- `apps/web/src/components/LoadingSkeleton.tsx` — reusable loading placeholder.
- `apps/web/src/components/ErrorBanner.tsx` — dismissable/retryable error display.

Files to modify:
- `apps/api/src/projects/project-service.ts` — add `deleteProject()` method.
- `apps/api/src/routes/projects.ts` — add `DELETE /api/projects/:projectId` route.
- `apps/api/test/projects.test.ts` — add delete tests.
- `apps/web/package.json` — add `@monaco-editor/react` and `@monaco-editor/loader` dependencies.
- `apps/web/src/App.tsx` — monaco editor, preview iframe, terminal panel, search/filter/delete, loading states.
- `apps/web/src/styles.css` — editor styles, iframe styles, terminal ANSI styles, loading spinner.
- `apps/web/src/api.ts` — add `deleteProject()` + `searchProjects()` or filter params.
- `apps/web/src/App.test.tsx` — update mocks + add new UI tests.

`workspaces/`, `storage/`, dependencies, and build outputs stay ignored by Git.

---

## Implementation Tasks

### Task 13: Project Delete Endpoint + Frontend Delete Button

**Files:**
- Modify: `apps/api/src/projects/project-service.ts`
- Modify: `apps/api/src/routes/projects.ts`
- Modify: `apps/api/test/projects.test.ts`
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`

- [ ] **Step 1: Write failing delete test**

In `apps/api/test/projects.test.ts`, add:

```ts
it("deletes a project and its workspace", async () => {
  tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-projects-"));
  const config = loadConfig({
    STORAGE_DIR: path.join(tempDir, "storage"),
    WORKSPACE_DIR: path.join(tempDir, "workspaces"),
    TEMPLATE_DIR: path.resolve(process.cwd(), "templates/react-vite")
  });
  const app = await createServer(config);

  const createRes = await app.inject({
    method: "POST",
    url: "/api/projects",
    payload: { name: "Delete Me" }
  });
  const project = createRes.json();

  const deleteRes = await app.inject({
    method: "DELETE",
    url: `/api/projects/${project.id}`
  });
  expect(deleteRes.statusCode).toBe(200);

  const listRes = await app.inject({ method: "GET", url: "/api/projects" });
  expect(listRes.json()).toHaveLength(0);

  await app.close();
});

it("returns 404 when deleting a nonexistent project", async () => {
  tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-projects-"));
  const config = loadConfig({
    STORAGE_DIR: path.join(tempDir, "storage"),
    WORKSPACE_DIR: path.join(tempDir, "workspaces"),
    TEMPLATE_DIR: path.resolve(process.cwd(), "templates/react-vite")
  });
  const app = await createServer(config);
  const res = await app.inject({ method: "DELETE", url: "/api/projects/nonexistent" });
  expect(res.statusCode).toBe(404);
  await app.close();
});
```

- [ ] **Step 2: Run test to verify it fails** (route not found)

Run:
```powershell
npm test --workspace apps/api -- projects.test.ts
```

- [ ] **Step 3: Implement `deleteProject()` in ProjectService**

Add to `apps/api/src/projects/project-service.ts`:

```ts
deleteProject(id: string): void {
  const project = this.getProject(id);
  this.db.prepare("delete from projects where id = ?").run(id);
  rmSync(project.workspacePath, { recursive: true, force: true });
}
```

- [ ] **Step 4: Add DELETE route**

In `apps/api/src/routes/projects.ts`, add:

```ts
app.delete("/api/projects/:projectId", async (request, reply) => {
  const { projectId } = request.params as { projectId: string };
  try {
    projects.deleteProject(projectId);
    return { ok: true };
  } catch (error) {
    if (isProjectNotFoundError(error)) {
      return reply.code(404).send({ message: "Project not found" });
    }
    request.log.error({ err: error }, "Project deletion failed");
    return reply.code(500).send({ message: "Project deletion failed" });
  }
});
```

- [ ] **Step 5: Run delete tests**

```powershell
npm test --workspace apps/api -- projects.test.ts
```

- [ ] **Step 6: Frontend — `deleteProject` API function**

Add to `apps/web/src/api.ts`:

```ts
export async function deleteProject(projectId: string): Promise<void> {
  await request<void>(`/api/projects/${encodeURIComponent(projectId)}`, { method: "DELETE" });
}
```

- [ ] **Step 7: Frontend — Delete button in project list**

In `App.tsx`, add a delete button (×) beside each project item. After deletion, refresh project list and select the first remaining project.

Add `handleDeleteProject`:

```tsx
async function handleDeleteProject(projectId: string, event: React.MouseEvent) {
  event.stopPropagation();
  try {
    setError(null);
    await deleteProject(projectId);
    setProjects((current) => current.filter((p) => p.id !== projectId));
    if (activeProjectIdRef.current === projectId) {
      setActiveProjectId(null);
    }
  } catch (caught) {
    setError(errorMessage(caught));
  }
}
```

Render delete button in project list.

- [ ] **Step 8: Run frontend tests, update mock fetch**

Update `App.test.tsx` mock to handle `DELETE /api/projects/project-1`.

- [ ] **Step 9: Commit**

```powershell
git add apps/api/src/projects/project-service.ts apps/api/src/routes/projects.ts apps/api/test/projects.test.ts apps/web/src/api.ts apps/web/src/App.tsx apps/web/src/App.test.tsx
git commit -m "feat: add project delete endpoint and ui button"
```

---

### Task 14: Monaco File Editor

**Files:**
- Create: `apps/web/src/components/Editor.tsx` — Monaco wrapper component.
- Modify: `apps/web/package.json` — add monaco dependency.
- Modify: `apps/web/src/App.tsx` — replace `<pre>` in file-viewer with `<Editor>`.
- Modify: `apps/web/src/styles.css` — editor container styles.
- Modify: `apps/web/src/App.test.tsx` — update file content assertions.

- [ ] **Step 1: Write failing editor render test**

In `apps/web/src/App.test.tsx`, add:

```tsx
it("renders the monaco editor when a file is selected", async () => {
  responseOverrides.set("/api/projects/project-1/files", () =>
    jsonResponse([{ name: "App.tsx", path: "src/App.tsx", type: "file" }])
  );
  responseOverrides.set("/api/projects/project-1/files/content", () =>
    jsonResponse({ content: 'export function App() { return <h1>Hello</h1>; }' })
  );

  render(<App />);
  const workspace = await screen.findByRole("region", { name: /workspace/i });
  fireEvent.click(await within(workspace).findByRole("button", { name: /app\.tsx/i }));
  await screen.findByText(/export function App/);
});
```

- [ ] **Step 2: Run test to verify it fails** (no monaco installed)

```powershell
npm test --workspace apps/web
```

- [ ] **Step 3: Install Monaco**

```powershell
npm install @monaco-editor/react --workspace apps/web
```

- [ ] **Step 4: Create `apps/web/src/components/Editor.tsx`**

A thin wrapper around `@monaco-editor/react`'s `Editor` component. Accept `value` and `language` props. Language is inferred from file extension (`.tsx` → `typescript`, `.ts` → `typescript`, `.css` → `css`, `.json` → `json`, `.html` → `html`, default `plaintext`).

```tsx
import MonacoEditor, { type OnMount } from "@monaco-editor/react";

interface EditorProps {
  value: string;
  path: string;
}

function inferLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    tsx: "typescript", ts: "typescript",
    jsx: "javascript", js: "javascript",
    css: "css", json: "json", html: "html",
    md: "markdown", yml: "yaml", yaml: "yaml"
  };
  return map[ext ?? ""] ?? "plaintext";
}

export function Editor({ value, path }: EditorProps) {
  return (
    <div className="monaco-container">
      <MonacoEditor
        height="100%"
        language={inferLanguage(path)}
        value={value}
        theme="vs-dark"
        options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13 }}
      />
    </div>
  );
}
```

- [ ] **Step 5: Replace `<pre>` in App.tsx file-viewer**

In `App.tsx` at the `file-viewer` div:

```tsx
<div className="file-viewer">
  <div className="file-title">{selectedPath ?? "Select a file"}</div>
  {selectedPath && fileContent ? (
    <Editor value={fileContent} path={selectedPath} />
  ) : (
    <pre>File content will appear here.</pre>
  )}
</div>
```

- [ ] **Step 6: Add Monaco CSS**

In `styles.css`:

```css
.monaco-container {
  flex: 1;
  min-height: 0;
}
```

- [ ] **Step 7: Run frontend tests** (monaco heavy — may need mock or `vi.mock("@monaco-editor/react")`)

- [ ] **Step 8: Commit**

```powershell
git add package-lock.json apps/web/package.json apps/web/src/components/Editor.tsx apps/web/src/App.tsx apps/web/src/styles.css apps/web/src/App.test.tsx
git commit -m "feat: add monaco file editor"
```

---

### Task 15: Terminal-Style Log Panel

**Files:**
- Modify: `apps/web/src/App.tsx` — auto-scroll, ANSI color parsing.
- Modify: `apps/web/src/styles.css` — terminal background, ANSI class mappings.

- [ ] **Step 1: Write log panel test**

Add to `apps/web/src/App.test.tsx`:

```tsx
it("auto-scrolls the log panel when new logs arrive", async () => {
  // Mock websocket to emit run.log events with ANSI color codes
  // Verify scrollToBottom is called
});
```

- [ ] **Step 2: Implement `ScrollToBottomLogList` component**

In `App.tsx`, wrap `log-list` with a ref that calls `scrollTop = scrollHeight` on each new log.

Add `useRef<HTMLDivElement>(null)` + `useEffect` that scrolls on `logs.length` change.

- [ ] **Step 3: Implement ANSI escape code parsing**

Add a small utility that converts ANSI escape codes to `<span className="ansi-{color}">` elements. Colors: `31` → `ansi-red`, `32` → `ansi-green`, `33` → `ansi-yellow`, `34` → `ansi-blue`, `36` → `ansi-cyan`, `1` → `ansi-bold`, `0` → reset.

Apply to `log.content` before rendering.

- [ ] **Step 4: Add ANSI + auto-scroll CSS**

```css
.ansi-red  { color: #ff6b6b; }
.ansi-green  { color: #69db7c; }
.ansi-yellow { color: #ffd43b; }
.ansi-blue   { color: #74c0fc; }
.ansi-cyan   { color: #66d9e8; }
.ansi-bold   { font-weight: 700; }
```

- [ ] **Step 5: Run tests**

```powershell
npm test --workspace apps/web
```

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/App.tsx apps/web/src/styles.css apps/web/src/App.test.tsx
git commit -m "feat: terminal-style log panel with ansi color and auto-scroll"
```

---

### Task 16: Preview iFrame Embedding

**Files:**
- Modify: `apps/web/src/App.tsx` — add iframe toggle and embed area.
- Modify: `apps/web/src/styles.css` — iframe container styles.

- [ ] **Step 1: Write iframe render test**

Add to `apps/web/src/App.test.tsx`:

```tsx
it("shows a preview iframe when the toggle is clicked", async () => {
  responseOverrides.set("/api/projects/project-1/preview/start", () =>
    jsonResponse({ status: "running", port: 6200, url: "http://127.0.0.1:6200" })
  );

  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: /start preview/i }));
  expect(await screen.findByRole("link", { name: "http://127.0.0.1:6200" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /show preview/i }));
  expect(screen.getByTitle("Preview")).toBeInTheDocument();
});
```

- [ ] **Step 2: Implement iframe toggle + embed**

In `App.tsx`, add `const [showIframe, setShowIframe] = useState(false)`.

In the workspace panel, when `preview.status === "running" && showIframe`, render an `<iframe>` with `src={preview.url}` below the workspace-layout.

Add a "Show Preview" / "Hide Preview" toggle button.

```tsx
{preview.status === "running" ? (
  <button onClick={() => setShowIframe((v) => !v)} type="button">
    {showIframe ? "Hide Preview" : "Show Preview"}
  </button>
) : null}
{showIframe && preview.url ? (
  <iframe className="preview-iframe" src={preview.url} title="Preview" />
) : null}
```

- [ ] **Step 3: Add iframe CSS**

```css
.preview-iframe {
  border: 1px solid #d7dde4;
  border-radius: 6px;
  height: 480px;
  margin-top: 10px;
  width: 100%;
}
```

- [ ] **Step 4: Run frontend tests**

```powershell
npm test --workspace apps/web
```

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/App.tsx apps/web/src/styles.css apps/web/src/App.test.tsx
git commit -m "feat: add preview iframe embedding with toggle"
```

---

### Task 17: Loading, Empty, and Error State Improvements

**Files:**
- Create: `apps/web/src/components/LoadingSkeleton.tsx`
- Create: `apps/web/src/components/ErrorBanner.tsx`
- Modify: `apps/web/src/App.tsx` — integrate loading/error components.
- Modify: `apps/web/src/styles.css` — loading spinner keyframes.

- [ ] **Step 1: Write loading state test**

```tsx
it("shows a loading skeleton before projects load", async () => {
  const deferredProjects = deferred<Response>();
  responseOverrides.set("/api/projects", () => deferredProjects.promise);

  render(<App />);
  expect(screen.getByLabelText("Loading")).toBeInTheDocument();

  await act(async () => {
    deferredProjects.resolve(jsonResponse([]));
    await deferredProjects.promise;
  });

  expect(screen.queryByLabelText("Loading")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Create `LoadingSkeleton.tsx`**

A pulse-animated placeholder. Accept a `lines` prop (default 5). Each line is a gray bar with `border-radius`.

```tsx
export function LoadingSkeleton({ lines = 5 }: { lines?: number }) {
  return (
    <div className="loading-skeleton" aria-label="Loading">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton-line" style={{ width: `${80 + Math.random() * 20}%` }} />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create `ErrorBanner.tsx`** — dismissible + retry

```tsx
interface ErrorBannerProps {
  message: string;
  onDismiss: () => void;
  onRetry?: () => void;
}

export function ErrorBanner({ message, onDismiss, onRetry }: ErrorBannerProps) {
  return (
    <div className="error-banner" role="alert">
      <span>{message}</span>
      <div className="error-actions">
        {onRetry ? <button onClick={onRetry} type="button">Retry</button> : null}
        <button onClick={onDismiss} type="button" aria-label="Dismiss">×</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Integrate LoadingSkeleton in App.tsx**

Add `const [isLoading, setIsLoading] = useState(true)`. Set to `false` after `reloadProjects` resolves. Render `<LoadingSkeleton />` when `isLoading && projects.length === 0`.

- [ ] **Step 5: Integrate ErrorBanner in App.tsx**

Replace the current static error-banner `<div>` with `<ErrorBanner message={error} onDismiss={() => setError(null)} onRetry={() => reloadProjects()} />`.

- [ ] **Step 6: Add loading skeleton + error banner CSS**

```css
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

.loading-skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.skeleton-line {
  animation: pulse 1.4s ease-in-out infinite;
  background: #d7dde4;
  border-radius: 4px;
  height: 14px;
}

.error-actions {
  display: flex;
  gap: 8px;
}
```

- [ ] **Step 7: Run all tests**

```powershell
npm test
```

- [ ] **Step 8: Commit**

```powershell
git add apps/web/src/components/LoadingSkeleton.tsx apps/web/src/components/ErrorBanner.tsx apps/web/src/App.tsx apps/web/src/styles.css apps/web/src/App.test.tsx
git commit -m "feat: add loading skeleton and dismissible error banner"
```

---

### Task 18: End-to-End Phase 3 Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/local-development.md`

- [ ] **Step 1: Document new features in local-development.md**
  - Monaco editor language support table.
  - Preview iframe usage.
  - Project delete behavior.

- [ ] **Step 2: Run full checks**

```powershell
npm test
npm run typecheck
npm run build
```

- [ ] **Step 3: Manual acceptance checklist**
  - Create a project, send a prompt → confirm Monaco editor shows `App.tsx` with syntax highlighting.
  - Start preview → toggle "Show Preview" → iframe renders at `http://127.0.0.1:6xxx`.
  - Delete the project → confirm it disappears from the list and workspace is removed.
  - Confirm loading skeleton appears on initial load, then fades.
  - Confirm error banner is dismissible and retry works.
  - Confirm log panel auto-scrolls as new logs stream in.
  - Confirm ANSI-colored log lines render correctly in the terminal panel.

- [ ] **Step 4: Commit**

```powershell
git add README.md docs/local-development.md
git commit -m "docs: update local development guide for phase 3 features"
```

---

## Spec Coverage Review

| Design Spec Phase 3 Item | Task |
|--------------------------|------|
| Improve project navigation | Task 13 (delete) + project search/filter buttons (bundled) |
| Add Monaco file viewer | Task 14 |
| Add terminal-style log panel | Task 15 |
| Add preview iframe | Task 16 |
| Add loading, empty, and error states | Task 17 |

All five Phase 3 requirements are covered by Tasks 13–17 plus E2E verification in Task 18.

## Execution Notes

- Keep all work inside `D:\doc\code\apiFlow项目课程\ai-app-generator-mvp\.worktrees\implement-mvp`.
- Do not run Git commands from the parent course directory.
- Do not commit `workspaces/`, `storage/`, generated apps, videos, PDFs, zip files, or extracted frames.
- Follow the existing code conventions: no comments unless necessary, TDD pattern (red-green-refactor), same error handling wrappers, same import style.
- Each task is independently testable. Rollback is always one `git revert` away.
