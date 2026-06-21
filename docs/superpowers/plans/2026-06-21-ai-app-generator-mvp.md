# AI App Generator MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Web Studio that creates a Vite React project, runs an Agent against that project workspace, streams logs, shows generated files, and starts a local preview.

**Architecture:** Use an npm workspace monorepo with `apps/api`, `apps/web`, `packages/shared`, and `templates/react-vite`. The API owns project orchestration, SQLite persistence, filesystem access, Agent execution, WebSocket events, and preview processes. The web app calls the API, subscribes to project WebSocket events, and renders project state, messages, logs, files, and preview status.

**Tech Stack:** Node.js, TypeScript, Fastify, `@fastify/websocket`, SQLite via `better-sqlite3`, Vitest, React, Vite, npm workspaces, OpenCode CLI.

---

## File Structure

Create and maintain these files inside `D:\doc\code\apiFlow项目课程\ai-app-generator-mvp` only.

- `package.json`: root npm workspace scripts.
- `tsconfig.base.json`: shared TypeScript compiler settings.
- `.env.example`: documented runtime variables without secrets.
- `packages/shared/package.json`: shared package manifest.
- `packages/shared/tsconfig.json`: shared package TypeScript config.
- `packages/shared/src/index.ts`: shared API/event/domain types.
- `apps/api/package.json`: API package manifest.
- `apps/api/tsconfig.json`: API TypeScript config.
- `apps/api/vitest.config.ts`: API test config.
- `apps/api/src/config.ts`: environment and path configuration.
- `apps/api/src/db/schema.ts`: SQLite schema creation.
- `apps/api/src/db/database.ts`: database connection and helpers.
- `apps/api/src/projects/project-service.ts`: create/list/read project records and copy templates.
- `apps/api/src/conversations/conversation-service.ts`: persist messages and Agent run records.
- `apps/api/src/agent/agent-runner.ts`: fake and OpenCode Agent runners.
- `apps/api/src/events/event-bus.ts`: in-process project event broadcast.
- `apps/api/src/files/file-service.ts`: workspace file tree and content access.
- `apps/api/src/preview/preview-manager.ts`: local Vite preview process management.
- `apps/api/src/routes/*.ts`: Fastify routes grouped by responsibility.
- `apps/api/src/server.ts`: Fastify app factory.
- `apps/api/src/index.ts`: API process entrypoint.
- `apps/api/test/*.test.ts`: focused backend tests.
- `apps/web/package.json`: web package manifest.
- `apps/web/tsconfig.json`: web TypeScript config.
- `apps/web/vite.config.ts`: Vite config.
- `apps/web/index.html`: app shell.
- `apps/web/src/*`: React Studio implementation.
- `templates/react-vite/*`: built-in app template copied into generated workspaces.

`workspaces/`, `storage/`, dependencies, and build outputs stay ignored by Git.

## Implementation Tasks

### Task 1: Workspace Bootstrap

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.env.example`
- Modify: `.gitignore`
- Test: root npm script resolution

- [ ] **Step 1: Create root npm workspace files**

Write `package.json`:

```json
{
  "name": "ai-app-generator-mvp",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "npm run dev --workspace apps/api",
    "dev:api": "npm run dev --workspace apps/api",
    "dev:web": "npm run dev --workspace apps/web",
    "build": "npm run build --workspaces",
    "test": "npm run test --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present"
  },
  "engines": {
    "node": ">=20.11.0"
  }
}
```

Write `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noUncheckedIndexedAccess": true
  }
}
```

Write `.env.example`:

```text
API_HOST=127.0.0.1
API_PORT=4317
WEB_ORIGIN=http://127.0.0.1:5173
STORAGE_DIR=./storage
WORKSPACE_DIR=./workspaces
TEMPLATE_DIR=./templates/react-vite
AGENT_PROVIDER=fake
OPENCODE_COMMAND=opencode
OPENCODE_AGENT=build
OPENCODE_RUN_FORMAT=json
PREVIEW_HOST=127.0.0.1
PREVIEW_PORT_START=6200
```

- [ ] **Step 2: Ensure ignored runtime directories are covered**

Update `.gitignore` to include these lines if they are not already present:

```text
storage/
workspaces/
previews/
```

- [ ] **Step 3: Verify workspace scripts are discoverable**

Run:

```powershell
npm pkg get workspaces
```

Expected:

```text
[
  "apps/*",
  "packages/*"
]
```

- [ ] **Step 4: Commit**

```powershell
git add package.json tsconfig.base.json .env.example .gitignore
git commit -m "chore: configure npm workspace"
```

### Task 2: Shared Types Package

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Test: `packages/shared/src/index.test.ts`

- [ ] **Step 1: Write failing type/runtime tests**

Create `packages/shared/src/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isTerminalRunStatus, projectEventTypes } from "./index.js";

describe("shared domain helpers", () => {
  it("identifies terminal run statuses", () => {
    expect(isTerminalRunStatus("succeeded")).toBe(true);
    expect(isTerminalRunStatus("failed")).toBe(true);
    expect(isTerminalRunStatus("cancelled")).toBe(true);
    expect(isTerminalRunStatus("running")).toBe(false);
  });

  it("lists websocket event types used by the API and web app", () => {
    expect(projectEventTypes).toEqual([
      "run.status",
      "run.log",
      "files.changed",
      "preview.status",
      "error"
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails before implementation**

Run:

```powershell
npm test --workspace packages/shared
```

Expected: fails because `packages/shared/package.json` and `packages/shared/src/index.ts` are not implemented yet.

- [ ] **Step 3: Create shared package**

Create `packages/shared/package.json`:

```json
{
  "name": "@ai-app-generator/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "vitest": "^2.1.8"
  }
}
```

Create `packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  },
  "include": ["src/**/*.ts"]
}
```

Create `packages/shared/src/index.ts`:

```ts
export type ProjectStatus = "created" | "generating" | "ready" | "error";
export type PreviewStatus = "stopped" | "starting" | "running" | "error";
export type MessageRole = "user" | "assistant" | "system";
export type AgentRunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type AgentLogStream = "stdout" | "stderr" | "event";

export interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  status: ProjectStatus;
  previewStatus: PreviewStatus;
  previewPort: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  agentRunId: string | null;
  createdAt: string;
}

export interface AgentRun {
  id: string;
  projectId: string;
  conversationId: string;
  status: AgentRunStatus;
  prompt: string;
  command: string;
  exitCode: number | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface AgentLog {
  id: string;
  agentRunId: string;
  stream: AgentLogStream;
  content: string;
  sequence: number;
  createdAt: string;
}

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

export interface PreviewInfo {
  status: PreviewStatus;
  port: number | null;
  url: string | null;
}

export const projectEventTypes = [
  "run.status",
  "run.log",
  "files.changed",
  "preview.status",
  "error"
] as const;

export type ProjectEventType = (typeof projectEventTypes)[number];

export type ProjectEvent =
  | { type: "run.status"; projectId: string; run: AgentRun }
  | { type: "run.log"; projectId: string; log: AgentLog }
  | { type: "files.changed"; projectId: string }
  | { type: "preview.status"; projectId: string; preview: PreviewInfo }
  | { type: "error"; projectId: string; message: string };

export function isTerminalRunStatus(status: AgentRunStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}
```

- [ ] **Step 4: Install dependencies and run tests**

Run:

```powershell
npm install
npm test --workspace packages/shared
npm run typecheck --workspace packages/shared
```

Expected: tests pass and TypeScript emits no errors.

- [ ] **Step 5: Commit**

```powershell
git add package-lock.json packages/shared
git commit -m "feat: add shared domain types"
```

### Task 3: API Skeleton And Configuration

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/src/config.ts`
- Create: `apps/api/src/server.ts`
- Create: `apps/api/src/index.ts`
- Test: `apps/api/test/config.test.ts`
- Test: `apps/api/test/health.test.ts`

- [ ] **Step 1: Write failing API tests**

Create `apps/api/test/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("loads defaults for local development", () => {
    const config = loadConfig({});
    expect(config.apiHost).toBe("127.0.0.1");
    expect(config.apiPort).toBe(4317);
    expect(config.agentProvider).toBe("fake");
    expect(config.opencodeCommand).toBe("opencode");
  });
});
```

Create `apps/api/test/health.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";
import { loadConfig } from "../src/config.js";

describe("health route", () => {
  it("returns ok", async () => {
    const app = await createServer(loadConfig({}));
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    await app.close();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
npm test --workspace apps/api
```

Expected: fails because API package files are not implemented.

- [ ] **Step 3: Create API package**

Create `apps/api/package.json`:

```json
{
  "name": "apps/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@ai-app-generator/shared": "file:../../packages/shared",
    "@fastify/cors": "^10.0.2",
    "@fastify/websocket": "^11.0.1",
    "better-sqlite3": "^11.7.0",
    "fastify": "^5.2.1",
    "nanoid": "^5.0.9"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3",
    "vitest": "^2.1.8"
  }
}
```

Create `apps/api/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

Create `apps/api/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"]
  }
});
```

- [ ] **Step 4: Create configuration and server entry**

Create `apps/api/src/config.ts`:

```ts
import path from "node:path";

export interface AppConfig {
  apiHost: string;
  apiPort: number;
  webOrigin: string;
  storageDir: string;
  workspaceDir: string;
  templateDir: string;
  agentProvider: "fake" | "opencode";
  opencodeCommand: string;
  opencodeAgent: string;
  opencodeRunFormat: "json";
  previewHost: string;
  previewPortStart: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const cwd = process.cwd();
  return {
    apiHost: env.API_HOST ?? "127.0.0.1",
    apiPort: Number(env.API_PORT ?? 4317),
    webOrigin: env.WEB_ORIGIN ?? "http://127.0.0.1:5173",
    storageDir: path.resolve(cwd, env.STORAGE_DIR ?? "./storage"),
    workspaceDir: path.resolve(cwd, env.WORKSPACE_DIR ?? "./workspaces"),
    templateDir: path.resolve(cwd, env.TEMPLATE_DIR ?? "./templates/react-vite"),
    agentProvider: env.AGENT_PROVIDER === "opencode" ? "opencode" : "fake",
    opencodeCommand: env.OPENCODE_COMMAND ?? "opencode",
    opencodeAgent: env.OPENCODE_AGENT ?? "build",
    opencodeRunFormat: "json",
    previewHost: env.PREVIEW_HOST ?? "127.0.0.1",
    previewPortStart: Number(env.PREVIEW_PORT_START ?? 6200)
  };
}
```

Create `apps/api/src/server.ts`:

```ts
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import type { AppConfig } from "./config.js";

export async function createServer(config: AppConfig) {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: config.webOrigin });
  await app.register(websocket);

  app.get("/api/health", async () => ({ ok: true }));

  return app;
}
```

Create `apps/api/src/index.ts`:

```ts
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";

const config = loadConfig();
const app = await createServer(config);

await app.listen({ host: config.apiHost, port: config.apiPort });
```

- [ ] **Step 5: Run API checks**

Run:

```powershell
npm install
npm test --workspace apps/api
npm run typecheck --workspace apps/api
```

Expected: tests pass and TypeScript emits no errors.

- [ ] **Step 6: Commit**

```powershell
git add package-lock.json apps/api
git commit -m "feat: add api skeleton"
```

### Task 4: SQLite Schema And Database Helpers

**Files:**
- Create: `apps/api/src/db/schema.ts`
- Create: `apps/api/src/db/database.ts`
- Test: `apps/api/test/database.test.ts`

- [ ] **Step 1: Write failing database test**

Create `apps/api/test/database.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../src/db/database.js";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe("database schema", () => {
  it("creates required tables", () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-db-"));
    const db = openDatabase(path.join(tempDir, "app.sqlite"));
    const tables = db
      .prepare("select name from sqlite_master where type = 'table' order by name")
      .all()
      .map((row: any) => row.name);
    expect(tables).toContain("projects");
    expect(tables).toContain("conversations");
    expect(tables).toContain("messages");
    expect(tables).toContain("agent_runs");
    expect(tables).toContain("agent_logs");
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm test --workspace apps/api -- database.test.ts
```

Expected: fails because database helpers do not exist.

- [ ] **Step 3: Implement schema**

Create `apps/api/src/db/schema.ts`:

```ts
import type Database from "better-sqlite3";

export function migrate(db: Database.Database) {
  db.exec(`
    create table if not exists projects (
      id text primary key,
      name text not null,
      slug text not null unique,
      workspace_path text not null,
      status text not null,
      preview_port integer,
      preview_status text not null,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists conversations (
      id text primary key,
      project_id text not null references projects(id) on delete cascade,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists messages (
      id text primary key,
      conversation_id text not null references conversations(id) on delete cascade,
      role text not null,
      content text not null,
      agent_run_id text,
      created_at text not null
    );

    create table if not exists agent_runs (
      id text primary key,
      project_id text not null references projects(id) on delete cascade,
      conversation_id text not null references conversations(id) on delete cascade,
      status text not null,
      prompt text not null,
      command text not null,
      exit_code integer,
      error_message text,
      started_at text,
      finished_at text,
      created_at text not null
    );

    create table if not exists agent_logs (
      id text primary key,
      agent_run_id text not null references agent_runs(id) on delete cascade,
      stream text not null,
      content text not null,
      sequence integer not null,
      created_at text not null
    );

    create index if not exists idx_conversations_project_id on conversations(project_id);
    create index if not exists idx_messages_conversation_id on messages(conversation_id);
    create index if not exists idx_agent_runs_project_id on agent_runs(project_id);
    create index if not exists idx_agent_logs_run_sequence on agent_logs(agent_run_id, sequence);
  `);
}
```

Create `apps/api/src/db/database.ts`:

```ts
import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { migrate } from "./schema.js";

export function openDatabase(filePath: string) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}
```

- [ ] **Step 4: Run database tests**

Run:

```powershell
npm test --workspace apps/api -- database.test.ts
```

Expected: test passes.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/db apps/api/test/database.test.ts
git commit -m "feat: add sqlite schema"
```

### Task 5: React Vite Template

**Files:**
- Create: `templates/react-vite/package.json`
- Create: `templates/react-vite/index.html`
- Create: `templates/react-vite/src/App.tsx`
- Create: `templates/react-vite/src/main.tsx`
- Create: `templates/react-vite/src/styles.css`
- Create: `templates/react-vite/tsconfig.json`
- Create: `templates/react-vite/vite.config.ts`
- Test: `apps/api/test/template.test.ts`

- [ ] **Step 1: Write failing template test**

Create `apps/api/test/template.test.ts`:

```ts
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("react vite template", () => {
  it("contains the files required for preview", () => {
    const root = path.resolve(process.cwd(), "templates/react-vite");
    expect(existsSync(path.join(root, "package.json"))).toBe(true);
    expect(existsSync(path.join(root, "index.html"))).toBe(true);
    expect(existsSync(path.join(root, "src/App.tsx"))).toBe(true);
    expect(existsSync(path.join(root, "src/main.tsx"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm test --workspace apps/api -- template.test.ts
```

Expected: fails because template files are not present.

- [ ] **Step 3: Create template files**

Create `templates/react-vite/package.json`:

```json
{
  "name": "generated-react-app",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "typecheck": "tsc -b"
  },
  "dependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^6.0.5",
    "typescript": "^5.6.3",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {}
}
```

Create `templates/react-vite/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Generated App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `templates/react-vite/src/main.tsx`:

```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

Create `templates/react-vite/src/App.tsx`:

```tsx
export function App() {
  return (
    <main className="app-shell">
      <section className="panel">
        <p className="eyebrow">Generated React App</p>
        <h1>Ready for OpenCode</h1>
        <p>
          This starter app is intentionally small so the Agent can reshape it
          into the application requested by the user.
        </p>
      </section>
    </main>
  );
}
```

Create `templates/react-vite/src/styles.css`:

```css
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #172026;
  background: #f6f8fb;
}

.app-shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 32px;
}

.panel {
  width: min(720px, 100%);
  border: 1px solid #d7dde5;
  border-radius: 8px;
  background: #ffffff;
  padding: 32px;
}

.eyebrow {
  margin: 0 0 8px;
  color: #426b8f;
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
}

h1 {
  margin: 0 0 12px;
  font-size: 34px;
  line-height: 1.1;
}

p {
  margin: 0;
  line-height: 1.6;
}
```

Create `templates/react-vite/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2020"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
```

Create `templates/react-vite/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()]
});
```

- [ ] **Step 4: Run template test**

Run:

```powershell
npm test --workspace apps/api -- template.test.ts
```

Expected: test passes.

- [ ] **Step 5: Commit**

```powershell
git add templates/react-vite apps/api/test/template.test.ts
git commit -m "feat: add react vite template"
```

### Task 6: Project Service And Routes

**Files:**
- Create: `apps/api/src/projects/project-service.ts`
- Create: `apps/api/src/routes/projects.ts`
- Modify: `apps/api/src/server.ts`
- Test: `apps/api/test/projects.test.ts`

- [ ] **Step 1: Write failing project API test**

Create `apps/api/test/projects.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { createServer } from "../src/server.js";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe("project routes", () => {
  it("creates a project and copies the template", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-projects-"));
    const config = loadConfig({
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces"),
      TEMPLATE_DIR: path.resolve(process.cwd(), "templates/react-vite")
    });
    const app = await createServer(config);

    const response = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Todo App" }
    });

    expect(response.statusCode).toBe(201);
    const project = response.json();
    expect(project.name).toBe("Todo App");
    expect(project.status).toBe("created");

    const list = await app.inject({ method: "GET", url: "/api/projects" });
    expect(list.json()).toHaveLength(1);

    await app.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm test --workspace apps/api -- projects.test.ts
```

Expected: fails because project routes are missing.

- [ ] **Step 3: Implement project service**

Create `apps/api/src/projects/project-service.ts` with functions:

```ts
import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import type Database from "better-sqlite3";
import type { ProjectSummary } from "@ai-app-generator/shared";
import type { AppConfig } from "../config.js";

export class ProjectService {
  constructor(private readonly db: Database.Database, private readonly config: AppConfig) {}

  createProject(name: string): ProjectSummary {
    const now = new Date().toISOString();
    const id = nanoid();
    const slug = this.slugify(name, id);
    const workspacePath = path.join(this.config.workspaceDir, id);

    mkdirSync(this.config.workspaceDir, { recursive: true });
    cpSync(this.config.templateDir, workspacePath, { recursive: true });

    this.db.prepare(`
      insert into projects (id, name, slug, workspace_path, status, preview_port, preview_status, created_at, updated_at)
      values (?, ?, ?, ?, 'created', null, 'stopped', ?, ?)
    `).run(id, name, slug, workspacePath, now, now);

    this.db.prepare(`
      insert into conversations (id, project_id, created_at, updated_at)
      values (?, ?, ?, ?)
    `).run(nanoid(), id, now, now);

    return this.getProject(id);
  }

  listProjects(): ProjectSummary[] {
    return this.db.prepare("select * from projects order by created_at desc").all().map(mapProject);
  }

  getProject(id: string): ProjectSummary {
    const row = this.db.prepare("select * from projects where id = ?").get(id);
    if (!row) throw new Error(`Project not found: ${id}`);
    return mapProject(row);
  }

  getWorkspacePath(id: string): string {
    const row = this.db.prepare("select workspace_path from projects where id = ?").get(id) as { workspace_path: string } | undefined;
    if (!row) throw new Error(`Project not found: ${id}`);
    return row.workspace_path;
  }

  private slugify(name: string, id: string): string {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    return `${base || "project"}-${id.slice(0, 6)}`;
  }
}

function mapProject(row: any): ProjectSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    previewStatus: row.preview_status,
    previewPort: row.preview_port,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
```

- [ ] **Step 4: Implement routes and wire server dependencies**

Create `apps/api/src/routes/projects.ts`:

```ts
import type { FastifyInstance } from "fastify";
import type { ProjectService } from "../projects/project-service.js";

export async function registerProjectRoutes(app: FastifyInstance, projects: ProjectService) {
  app.get("/api/projects", async () => projects.listProjects());

  app.get("/api/projects/:projectId", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    try {
      return projects.getProject(projectId);
    } catch {
      return reply.code(404).send({ message: "Project not found" });
    }
  });

  app.post("/api/projects", async (request, reply) => {
    const body = request.body as { name?: string };
    const name = body.name?.trim();
    if (!name) return reply.code(400).send({ message: "Project name is required" });
    const project = projects.createProject(name);
    return reply.code(201).send(project);
  });
}
```

Modify `apps/api/src/server.ts` to open the database and register project routes:

```ts
import path from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import type { AppConfig } from "./config.js";
import { openDatabase } from "./db/database.js";
import { ProjectService } from "./projects/project-service.js";
import { registerProjectRoutes } from "./routes/projects.js";

export async function createServer(config: AppConfig) {
  const app = Fastify({ logger: true });
  const db = openDatabase(path.join(config.storageDir, "app.sqlite"));
  const projects = new ProjectService(db, config);

  await app.register(cors, { origin: config.webOrigin });
  await app.register(websocket);

  app.addHook("onClose", async () => db.close());
  app.get("/api/health", async () => ({ ok: true }));
  await registerProjectRoutes(app, projects);

  return app;
}
```

- [ ] **Step 5: Run tests**

Run:

```powershell
npm test --workspace apps/api -- projects.test.ts health.test.ts
```

Expected: project and health tests pass.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src apps/api/test/projects.test.ts
git commit -m "feat: add project creation api"
```

### Task 7: Event Bus, Conversation Service, And Fake Runner

**Files:**
- Create: `apps/api/src/events/event-bus.ts`
- Create: `apps/api/src/conversations/conversation-service.ts`
- Create: `apps/api/src/agent/agent-runner.ts`
- Create: `apps/api/src/routes/messages.ts`
- Modify: `apps/api/src/server.ts`
- Test: `apps/api/test/agent-runner.test.ts`
- Test: `apps/api/test/messages.test.ts`

- [ ] **Step 1: Write failing fake runner tests**

Create `apps/api/test/agent-runner.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EventBus } from "../src/events/event-bus.js";
import { FakeAgentRunner } from "../src/agent/agent-runner.js";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
});

describe("FakeAgentRunner", () => {
  it("emits logs and writes a generated file", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-agent-"));
    const bus = new EventBus();
    const logs: string[] = [];
    bus.subscribe("project-1", (event) => {
      if (event.type === "run.log") logs.push(event.log.content);
    });

    const runner = new FakeAgentRunner(bus);
    const result = await runner.run({
      projectId: "project-1",
      runId: "run-1",
      workspacePath: tempDir,
      prompt: "Build a todo app"
    });

    expect(result.exitCode).toBe(0);
    expect(logs.join("\n")).toContain("Fake Agent received prompt");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm test --workspace apps/api -- agent-runner.test.ts
```

Expected: fails because event bus and runner are missing.

- [ ] **Step 3: Implement event bus and fake runner**

Create `apps/api/src/events/event-bus.ts`:

```ts
import type { ProjectEvent } from "@ai-app-generator/shared";

type Listener = (event: ProjectEvent) => void;

export class EventBus {
  private readonly listeners = new Map<string, Set<Listener>>();

  subscribe(projectId: string, listener: Listener): () => void {
    const listeners = this.listeners.get(projectId) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(projectId, listeners);
    return () => listeners.delete(listener);
  }

  publish(event: ProjectEvent) {
    const listeners = this.listeners.get(event.projectId);
    if (!listeners) return;
    for (const listener of listeners) listener(event);
  }
}
```

Create `apps/api/src/agent/agent-runner.ts`:

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { nanoid } from "nanoid";
import type { AgentLog, AgentRun } from "@ai-app-generator/shared";
import type { EventBus } from "../events/event-bus.js";
import type { AppConfig } from "../config.js";

export interface AgentRunRequest {
  projectId: string;
  runId: string;
  workspacePath: string;
  prompt: string;
}

export interface AgentRunResult {
  exitCode: number;
  errorMessage: string | null;
}

export interface AgentRunner {
  run(request: AgentRunRequest): Promise<AgentRunResult>;
}

export class FakeAgentRunner implements AgentRunner {
  constructor(private readonly bus: EventBus) {}

  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    this.emit(request.projectId, request.runId, "event", "Fake Agent starting", 1);
    this.emit(request.projectId, request.runId, "stdout", `Fake Agent received prompt: ${request.prompt}`, 2);
    mkdirSync(path.join(request.workspacePath, "src"), { recursive: true });
    writeFileSync(
      path.join(request.workspacePath, "src", "App.tsx"),
      `export function App() { return <main><h1>${escapeText(request.prompt)}</h1></main>; }\n`,
      "utf8"
    );
    this.emit(request.projectId, request.runId, "event", "Fake Agent finished", 3);
    return { exitCode: 0, errorMessage: null };
  }

  private emit(projectId: string, runId: string, stream: AgentLog["stream"], content: string, sequence: number) {
    const createdAt = new Date().toISOString();
    this.bus.publish({
      type: "run.log",
      projectId,
      log: { id: nanoid(), agentRunId: runId, stream, content, sequence, createdAt }
    });
  }
}

export class OpenCodeAgentRunner implements AgentRunner {
  constructor(private readonly config: AppConfig, private readonly bus: EventBus) {}

  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    const args = [
      "run",
      "--format",
      this.config.opencodeRunFormat,
      "--dir",
      request.workspacePath,
      "--agent",
      this.config.opencodeAgent,
      buildPrompt(request.prompt)
    ];

    return new Promise((resolve) => {
      const child = spawn(this.config.opencodeCommand, args, {
        cwd: request.workspacePath,
        shell: false,
        windowsHide: true
      });

      let sequence = 0;
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer) => {
        sequence += 1;
        this.emit(request.projectId, request.runId, "stdout", chunk.toString(), sequence);
      });

      child.stderr.on("data", (chunk: Buffer) => {
        sequence += 1;
        const text = chunk.toString();
        stderr += text;
        this.emit(request.projectId, request.runId, "stderr", text, sequence);
      });

      child.on("error", (error) => {
        resolve({ exitCode: 1, errorMessage: error.message });
      });

      child.on("close", (code) => {
        resolve({ exitCode: code ?? 1, errorMessage: code === 0 ? null : stderr || `OpenCode exited with ${code}` });
      });
    });
  }

  private emit(projectId: string, runId: string, stream: AgentLog["stream"], content: string, sequence: number) {
    const createdAt = new Date().toISOString();
    this.bus.publish({
      type: "run.log",
      projectId,
      log: { id: nanoid(), agentRunId: runId, stream, content, sequence, createdAt }
    });
  }
}

export function createAgentRunner(config: AppConfig, bus: EventBus): AgentRunner {
  return config.agentProvider === "opencode" ? new OpenCodeAgentRunner(config, bus) : new FakeAgentRunner(bus);
}

function buildPrompt(userPrompt: string): string {
  return [
    "You are editing a generated Vite React app.",
    "Work only in the current project directory.",
    "Keep the app runnable with npm install and npm run dev.",
    "Do not read or modify files outside this workspace.",
    "",
    userPrompt
  ].join("\n");
}

function escapeText(value: string): string {
  return value.replace(/`/g, "").replace(/\$/g, "");
}
```

- [ ] **Step 4: Add conversation service and message route**

Create `apps/api/src/conversations/conversation-service.ts` with methods:

```ts
import { nanoid } from "nanoid";
import type Database from "better-sqlite3";
import type { AgentRun, ChatMessage } from "@ai-app-generator/shared";

export class ConversationService {
  constructor(private readonly db: Database.Database) {}

  getConversationId(projectId: string): string {
    const row = this.db.prepare("select id from conversations where project_id = ? order by created_at limit 1").get(projectId) as { id: string } | undefined;
    if (!row) throw new Error(`Conversation not found for project: ${projectId}`);
    return row.id;
  }

  listMessages(projectId: string): ChatMessage[] {
    const conversationId = this.getConversationId(projectId);
    return this.db.prepare("select * from messages where conversation_id = ? order by created_at asc").all(conversationId).map(mapMessage);
  }

  createUserMessage(conversationId: string, content: string): ChatMessage {
    const now = new Date().toISOString();
    const id = nanoid();
    this.db.prepare(`
      insert into messages (id, conversation_id, role, content, agent_run_id, created_at)
      values (?, ?, 'user', ?, null, ?)
    `).run(id, conversationId, content, now);
    return { id, conversationId, role: "user", content, agentRunId: null, createdAt: now };
  }

  hasActiveRun(projectId: string): boolean {
    const row = this.db.prepare("select id from agent_runs where project_id = ? and status in ('queued', 'running') limit 1").get(projectId);
    return Boolean(row);
  }

  createRun(projectId: string, conversationId: string, prompt: string, command: string): AgentRun {
    const now = new Date().toISOString();
    const id = nanoid();
    this.db.prepare(`
      insert into agent_runs (id, project_id, conversation_id, status, prompt, command, exit_code, error_message, started_at, finished_at, created_at)
      values (?, ?, ?, 'queued', ?, ?, null, null, null, null, ?)
    `).run(id, projectId, conversationId, prompt, command, now);
    return this.getRun(id);
  }

  updateRunStatus(id: string, status: AgentRun["status"], patch: { exitCode?: number | null; errorMessage?: string | null } = {}): AgentRun {
    const now = new Date().toISOString();
    if (status === "running") {
      this.db.prepare("update agent_runs set status = ?, started_at = ? where id = ?").run(status, now, id);
    } else {
      this.db.prepare("update agent_runs set status = ?, exit_code = ?, error_message = ?, finished_at = ? where id = ?")
        .run(status, patch.exitCode ?? null, patch.errorMessage ?? null, now, id);
    }
    return this.getRun(id);
  }

  recordLog(log: { id: string; agentRunId: string; stream: string; content: string; sequence: number; createdAt: string }) {
    this.db.prepare(`
      insert into agent_logs (id, agent_run_id, stream, content, sequence, created_at)
      values (?, ?, ?, ?, ?, ?)
    `).run(log.id, log.agentRunId, log.stream, log.content, log.sequence, log.createdAt);
  }

  getRun(id: string): AgentRun {
    const row = this.db.prepare("select * from agent_runs where id = ?").get(id);
    if (!row) throw new Error(`Agent run not found: ${id}`);
    return mapRun(row);
  }
}

function mapMessage(row: any): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    agentRunId: row.agent_run_id,
    createdAt: row.created_at
  };
}

function mapRun(row: any): AgentRun {
  return {
    id: row.id,
    projectId: row.project_id,
    conversationId: row.conversation_id,
    status: row.status,
    prompt: row.prompt,
    command: row.command,
    exitCode: row.exit_code,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at
  };
}
```

Create `apps/api/src/routes/messages.ts`:

```ts
import type { FastifyInstance } from "fastify";
import type { ProjectService } from "../projects/project-service.js";
import type { ConversationService } from "../conversations/conversation-service.js";
import type { AgentRunner } from "../agent/agent-runner.js";
import type { EventBus } from "../events/event-bus.js";

export async function registerMessageRoutes(
  app: FastifyInstance,
  projects: ProjectService,
  conversations: ConversationService,
  runner: AgentRunner,
  bus: EventBus
) {
  app.get("/api/projects/:projectId/messages", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    try {
      return conversations.listMessages(projectId);
    } catch {
      return reply.code(404).send({ message: "Project not found" });
    }
  });

  app.post("/api/projects/:projectId/messages", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = request.body as { content?: string };
    const content = body.content?.trim();
    if (!content) return reply.code(400).send({ message: "Message content is required" });

    try {
      const conversationId = conversations.getConversationId(projectId);
      const workspacePath = projects.getWorkspacePath(projectId);
      if (conversations.hasActiveRun(projectId)) {
        return reply.code(409).send({ message: "Project already has an active Agent run" });
      }
      const message = conversations.createUserMessage(conversationId, content);
      const run = conversations.createRun(projectId, conversationId, content, "agent");
      const unsubscribeLogRecorder = bus.subscribe(projectId, (event) => {
        if (event.type === "run.log" && event.log.agentRunId === run.id) conversations.recordLog(event.log);
      });
      const running = conversations.updateRunStatus(run.id, "running");
      bus.publish({ type: "run.status", projectId, run: running });

      void runner.run({ projectId, runId: run.id, workspacePath, prompt: content }).then((result) => {
        const status = result.exitCode === 0 ? "succeeded" : "failed";
        const finished = conversations.updateRunStatus(run.id, status, {
          exitCode: result.exitCode,
          errorMessage: result.errorMessage
        });
        bus.publish({ type: "run.status", projectId, run: finished });
        bus.publish({ type: "files.changed", projectId });
        unsubscribeLogRecorder();
      }).catch((error: unknown) => {
        const messageText = error instanceof Error ? error.message : "Agent run failed";
        const failed = conversations.updateRunStatus(run.id, "failed", { exitCode: 1, errorMessage: messageText });
        bus.publish({ type: "run.status", projectId, run: failed });
        unsubscribeLogRecorder();
      });

      return reply.code(202).send({ message, run });
    } catch {
      return reply.code(404).send({ message: "Project not found" });
    }
  });
}
```

- [ ] **Step 5: Run tests**

Run:

```powershell
npm test --workspace apps/api -- agent-runner.test.ts messages.test.ts
```

Expected: fake runner test passes; message route test passes after route implementation.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/events apps/api/src/conversations apps/api/src/agent apps/api/src/routes/messages.ts apps/api/src/server.ts apps/api/test/agent-runner.test.ts apps/api/test/messages.test.ts
git commit -m "feat: add fake agent run flow"
```

### Task 8: WebSocket Project Events

**Files:**
- Create: `apps/api/src/routes/ws.ts`
- Modify: `apps/api/src/server.ts`
- Test: `apps/api/test/websocket.test.ts`

- [ ] **Step 1: Write WebSocket test**

Create `apps/api/test/websocket.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import WebSocket from "ws";
import websocket from "@fastify/websocket";
import { EventBus } from "../src/events/event-bus.js";
import { registerWebSocketRoutes } from "../src/routes/ws.js";
import Fastify from "fastify";

describe("websocket project events", () => {
  it("sends subscribed project events to the client", async () => {
    const app = Fastify();
    const bus = new EventBus();
    await app.register(websocket);
    await registerWebSocketRoutes(app, bus);
    await app.listen({ host: "127.0.0.1", port: 0 });

    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP address");

    const message = await new Promise<any>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${address.port}/ws?projectId=project-1`);
      ws.on("open", () => {
        bus.publish({
          type: "run.status",
          projectId: "project-1",
          run: {
            id: "run-1",
            projectId: "project-1",
            conversationId: "conversation-1",
            status: "running",
            prompt: "Build",
            command: "agent",
            exitCode: null,
            errorMessage: null,
            startedAt: null,
            finishedAt: null,
            createdAt: new Date().toISOString()
          }
        });
      });
      ws.on("message", (data) => {
        ws.close();
        resolve(JSON.parse(data.toString()));
      });
      ws.on("error", reject);
    });

    expect(message.type).toBe("run.status");
    expect(message.projectId).toBe("project-1");
    await app.close();
  });
});
```

- [ ] **Step 2: Add `ws` test dependency**

Run:

```powershell
npm install -D ws @types/ws --workspace apps/api
```

- [ ] **Step 3: Implement WebSocket route**

Create `apps/api/src/routes/ws.ts`:

```ts
import type { FastifyInstance } from "fastify";
import type { EventBus } from "../events/event-bus.js";

export async function registerWebSocketRoutes(app: FastifyInstance, bus: EventBus) {
  app.get("/ws", { websocket: true }, (socket, request) => {
    const url = new URL(request.url, "http://localhost");
    const projectId = url.searchParams.get("projectId");
    if (!projectId) {
      socket.close(1008, "projectId is required");
      return;
    }

    const unsubscribe = bus.subscribe(projectId, (event) => {
      socket.send(JSON.stringify(event));
    });

    socket.on("close", unsubscribe);
  });
}
```

- [ ] **Step 4: Run WebSocket tests**

Run:

```powershell
npm test --workspace apps/api -- websocket.test.ts
```

Expected: WebSocket client receives the project event.

- [ ] **Step 5: Commit**

```powershell
git add package-lock.json apps/api
git commit -m "feat: stream project events over websocket"
```

### Task 9: File Service And Routes

**Files:**
- Create: `apps/api/src/files/file-service.ts`
- Create: `apps/api/src/routes/files.ts`
- Modify: `apps/api/src/server.ts`
- Test: `apps/api/test/files.test.ts`

- [ ] **Step 1: Write file service tests**

Create `apps/api/test/files.test.ts` with two tests:

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileService } from "../src/files/file-service.js";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
});

describe("FileService", () => {
  it("returns a file tree without ignored directories", () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-files-"));
    mkdirSync(path.join(tempDir, "src"));
    mkdirSync(path.join(tempDir, "node_modules"));
    writeFileSync(path.join(tempDir, "src", "App.tsx"), "export function App() { return null; }");
    writeFileSync(path.join(tempDir, "node_modules", "ignored.js"), "");

    const tree = new FileService().getTree(tempDir);
    expect(JSON.stringify(tree)).toContain("App.tsx");
    expect(JSON.stringify(tree)).not.toContain("ignored.js");
  });

  it("rejects path traversal", () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-files-"));
    const service = new FileService();
    expect(() => service.readFile(tempDir!, "../secret.txt")).toThrow("Invalid file path");
  });
});
```

- [ ] **Step 2: Implement file service**

Create `apps/api/src/files/file-service.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { FileNode } from "@ai-app-generator/shared";

const ignored = new Set(["node_modules", ".git", "dist", ".env", ".cache", "coverage"]);
const maxReadBytes = 256 * 1024;

export class FileService {
  getTree(workspacePath: string): FileNode[] {
    return this.readDirectory(workspacePath, workspacePath);
  }

  readFile(workspacePath: string, relativePath: string): string {
    const absolutePath = this.resolveInside(workspacePath, relativePath);
    const stat = statSync(absolutePath);
    if (!stat.isFile()) throw new Error("Path is not a file");
    if (stat.size > maxReadBytes) throw new Error("File is too large to display");
    return readFileSync(absolutePath, "utf8");
  }

  private readDirectory(root: string, current: string): FileNode[] {
    return readdirSync(current, { withFileTypes: true })
      .filter((entry) => !ignored.has(entry.name))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
      .map((entry) => {
        const absolute = path.join(current, entry.name);
        const relative = path.relative(root, absolute).replace(/\\/g, "/");
        if (entry.isDirectory()) {
          return { name: entry.name, path: relative, type: "directory", children: this.readDirectory(root, absolute) };
        }
        return { name: entry.name, path: relative, type: "file" };
      });
  }

  private resolveInside(root: string, relativePath: string): string {
    if (path.isAbsolute(relativePath)) throw new Error("Invalid file path");
    const resolved = path.resolve(root, relativePath);
    const normalizedRoot = path.resolve(root);
    if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
      throw new Error("Invalid file path");
    }
    return resolved;
  }
}
```

- [ ] **Step 3: Implement file routes**

Create `apps/api/src/routes/files.ts`:

```ts
import type { FastifyInstance } from "fastify";
import type { ProjectService } from "../projects/project-service.js";
import { FileService } from "../files/file-service.js";

export async function registerFileRoutes(app: FastifyInstance, projects: ProjectService, files = new FileService()) {
  app.get("/api/projects/:projectId/files", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    try {
      return files.getTree(projects.getWorkspacePath(projectId));
    } catch {
      return reply.code(404).send({ message: "Project not found" });
    }
  });

  app.get("/api/projects/:projectId/files/content", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const { path } = request.query as { path?: string };
    if (!path) return reply.code(400).send({ message: "File path is required" });
    try {
      const content = files.readFile(projects.getWorkspacePath(projectId), path);
      return { content };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to read file";
      const status = message === "Invalid file path" ? 400 : 404;
      return reply.code(status).send({ message });
    }
  });
}
```

- [ ] **Step 4: Run file tests**

Run:

```powershell
npm test --workspace apps/api -- files.test.ts
```

Expected: tests pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/files apps/api/src/routes/files.ts apps/api/src/server.ts apps/api/test/files.test.ts
git commit -m "feat: add workspace file api"
```

### Task 10: Preview Manager And Routes

**Files:**
- Create: `apps/api/src/preview/preview-manager.ts`
- Create: `apps/api/src/routes/preview.ts`
- Modify: `apps/api/src/server.ts`
- Test: `apps/api/test/preview.test.ts`

- [ ] **Step 1: Write preview manager tests**

Create `apps/api/test/preview.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { EventBus } from "../src/events/event-bus.js";
import { PreviewManager } from "../src/preview/preview-manager.js";

describe("PreviewManager", () => {
  it("builds local preview URLs", () => {
    const manager = new PreviewManager(loadConfig({ PREVIEW_PORT_START: "6200" }), new EventBus());
    expect(manager.buildUrl(6200)).toBe("http://127.0.0.1:6200");
  });

  it("allocates incrementing ports", () => {
    const manager = new PreviewManager(loadConfig({ PREVIEW_PORT_START: "6200" }), new EventBus());
    expect(manager.nextPort()).toBe(6200);
    expect(manager.nextPort()).toBe(6201);
  });

  it("stops a missing preview without throwing", () => {
    const manager = new PreviewManager(loadConfig({}), new EventBus());
    expect(manager.stop("missing-project")).toEqual({ status: "stopped", port: null, url: null });
  });
});
```

- [ ] **Step 2: Implement preview manager**

Create `apps/api/src/preview/preview-manager.ts`:

```ts
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { PreviewInfo } from "@ai-app-generator/shared";
import type { AppConfig } from "../config.js";
import type { EventBus } from "../events/event-bus.js";

export class PreviewManager {
  private nextPreviewPort: number;
  private readonly processes = new Map<string, ChildProcessWithoutNullStreams>();

  constructor(private readonly config: AppConfig, private readonly bus: EventBus) {
    this.nextPreviewPort = config.previewPortStart;
  }

  nextPort(): number {
    const port = this.nextPreviewPort;
    this.nextPreviewPort += 1;
    return port;
  }

  buildUrl(port: number): string {
    return `http://${this.config.previewHost}:${port}`;
  }

  start(projectId: string, workspacePath: string): PreviewInfo {
    this.stop(projectId);
    const port = this.nextPort();
    const child = spawn("npm", ["run", "dev", "--", "--host", this.config.previewHost, "--port", String(port)], {
      cwd: workspacePath,
      shell: true,
      windowsHide: true
    });
    this.processes.set(projectId, child);
    const preview = { status: "running" as const, port, url: this.buildUrl(port) };
    this.bus.publish({ type: "preview.status", projectId, preview });
    return preview;
  }

  stop(projectId: string): PreviewInfo {
    const existing = this.processes.get(projectId);
    if (existing) {
      existing.kill();
      this.processes.delete(projectId);
    }
    const preview = { status: "stopped" as const, port: null, url: null };
    this.bus.publish({ type: "preview.status", projectId, preview });
    return preview;
  }
}
```

- [ ] **Step 3: Implement preview routes**

Create `apps/api/src/routes/preview.ts`:

```ts
import type { FastifyInstance } from "fastify";
import type { ProjectService } from "../projects/project-service.js";
import type { PreviewManager } from "../preview/preview-manager.js";

export async function registerPreviewRoutes(app: FastifyInstance, projects: ProjectService, preview: PreviewManager) {
  app.post("/api/projects/:projectId/preview/start", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    try {
      return preview.start(projectId, projects.getWorkspacePath(projectId));
    } catch {
      return reply.code(404).send({ message: "Project not found" });
    }
  });

  app.post("/api/projects/:projectId/preview/stop", async (request) => {
    const { projectId } = request.params as { projectId: string };
    return preview.stop(projectId);
  });
}
```

- [ ] **Step 4: Run preview tests**

Run:

```powershell
npm test --workspace apps/api -- preview.test.ts
```

Expected: tests pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/preview apps/api/src/routes/preview.ts apps/api/src/server.ts apps/api/test/preview.test.ts
git commit -m "feat: add preview manager"
```

### Task 11: Web App Shell

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/api.ts`
- Create: `apps/web/src/styles.css`
- Test: `apps/web/src/App.test.tsx`

- [ ] **Step 1: Create web package and install dependencies**

Create `apps/web/package.json`:

```json
{
  "name": "apps/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1 --port 5173",
    "build": "tsc -p tsconfig.json && vite build",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@ai-app-generator/shared": "file:../../packages/shared",
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^6.0.5",
    "typescript": "^5.6.3",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.1.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@types/react": "^19.0.1",
    "@types/react-dom": "^19.0.2",
    "jsdom": "^25.0.1",
    "vitest": "^2.1.8"
  }
}
```

Create `apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "types": ["vite/client", "vitest/globals"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

Create `apps/web/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.tsx"]
  }
});
```

Create `apps/web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI App Generator</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Build API client**

Create `apps/web/src/api.ts`:

```ts
import type { ChatMessage, FileNode, PreviewInfo, ProjectSummary } from "@ai-app-generator/shared";

const apiBase = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:4317";

export async function listProjects(): Promise<ProjectSummary[]> {
  return request("/api/projects");
}

export async function createProject(name: string): Promise<ProjectSummary> {
  return request("/api/projects", { method: "POST", body: JSON.stringify({ name }) });
}

export async function listMessages(projectId: string): Promise<ChatMessage[]> {
  return request(`/api/projects/${projectId}/messages`);
}

export async function sendMessage(projectId: string, content: string): Promise<{ message: ChatMessage }> {
  return request(`/api/projects/${projectId}/messages`, { method: "POST", body: JSON.stringify({ content }) });
}

export async function getFiles(projectId: string): Promise<FileNode[]> {
  return request(`/api/projects/${projectId}/files`);
}

export async function getFileContent(projectId: string, filePath: string): Promise<{ content: string }> {
  return request(`/api/projects/${projectId}/files/content?path=${encodeURIComponent(filePath)}`);
}

export async function startPreview(projectId: string): Promise<PreviewInfo> {
  return request(`/api/projects/${projectId}/preview/start`, { method: "POST" });
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) }
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}
```

- [ ] **Step 3: Implement Studio UI**

Create `apps/web/src/main.tsx`:

```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

Create `apps/web/src/App.tsx`:

```tsx
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { AgentLog, ChatMessage, FileNode, PreviewInfo, ProjectEvent, ProjectSummary } from "@ai-app-generator/shared";
import { createProject, getFileContent, getFiles, listMessages, listProjects, sendMessage, startPreview } from "./api";

const apiBase = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:4317";
const wsBase = apiBase.replace(/^http/, "ws");

export function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [prompt, setPrompt] = useState("");
  const [projectName, setProjectName] = useState("Todo App");
  const [preview, setPreview] = useState<PreviewInfo>({ status: "stopped", port: null, url: null });

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [projects, activeProjectId]
  );

  useEffect(() => {
    listProjects().then((items) => {
      setProjects(items);
      setActiveProjectId(items[0]?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (!activeProjectId) return;
    listMessages(activeProjectId).then(setMessages);
    getFiles(activeProjectId).then(setFiles).catch(() => setFiles([]));
    const socket = new WebSocket(`${wsBase}/ws?projectId=${activeProjectId}`);
    socket.onmessage = (message) => {
      const event = JSON.parse(message.data) as ProjectEvent;
      if (event.type === "run.log") setLogs((current) => [...current, event.log]);
      if (event.type === "files.changed") getFiles(activeProjectId).then(setFiles);
      if (event.type === "preview.status") setPreview(event.preview);
    };
    return () => socket.close();
  }, [activeProjectId]);

  async function handleCreateProject(event: FormEvent) {
    event.preventDefault();
    const project = await createProject(projectName);
    setProjects((current) => [project, ...current]);
    setActiveProjectId(project.id);
  }

  async function handleSendPrompt(event: FormEvent) {
    event.preventDefault();
    if (!activeProjectId || !prompt.trim()) return;
    const response = await sendMessage(activeProjectId, prompt);
    setMessages((current) => [...current, response.message]);
    setPrompt("");
  }

  async function handleSelectFile(path: string) {
    if (!activeProjectId) return;
    setSelectedPath(path);
    const result = await getFileContent(activeProjectId, path);
    setFileContent(result.content);
  }

  async function handleStartPreview() {
    if (!activeProjectId) return;
    setPreview(await startPreview(activeProjectId));
  }

  return (
    <main className="studio">
      <aside className="panel project-panel">
        <h1>AI App Generator</h1>
        <form onSubmit={handleCreateProject} className="stack">
          <input value={projectName} onChange={(event) => setProjectName(event.target.value)} />
          <button type="submit">Create</button>
        </form>
        <div className="list">
          {projects.map((project) => (
            <button key={project.id} className={project.id === activeProjectId ? "selected" : ""} onClick={() => setActiveProjectId(project.id)}>
              {project.name}
            </button>
          ))}
        </div>
      </aside>

      <section className="panel conversation-panel">
        <h2>{activeProject?.name ?? "No project selected"}</h2>
        <div className="messages">
          {messages.map((message) => (
            <article key={message.id} className={`message ${message.role}`}>
              {message.content}
            </article>
          ))}
        </div>
        <div className="logs">
          {logs.map((log) => (
            <pre key={log.id}>{log.content}</pre>
          ))}
        </div>
        <form onSubmit={handleSendPrompt} className="prompt-form">
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe the app to generate" />
          <button type="submit" disabled={!activeProjectId}>Run Agent</button>
        </form>
      </section>

      <section className="panel workspace-panel">
        <div className="toolbar">
          <button onClick={handleStartPreview} disabled={!activeProjectId}>Start Preview</button>
          {preview.url ? <a href={preview.url} target="_blank" rel="noreferrer">{preview.url}</a> : <span>{preview.status}</span>}
        </div>
        <div className="workspace-grid">
          <FileTree nodes={files} onSelect={handleSelectFile} />
          <pre className="file-viewer">{selectedPath ? fileContent : "Select a file"}</pre>
        </div>
      </section>
    </main>
  );
}

function FileTree({ nodes, onSelect }: { nodes: FileNode[]; onSelect: (path: string) => void }) {
  return (
    <ul className="file-tree">
      {nodes.map((node) => (
        <li key={node.path}>
          {node.type === "file" ? <button onClick={() => onSelect(node.path)}>{node.name}</button> : <span>{node.name}</span>}
          {node.children ? <FileTree nodes={node.children} onSelect={onSelect} /> : null}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Style UI**

Create `apps/web/src/styles.css`:

```css
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #18222d;
  background: #eef2f6;
}

button,
input,
textarea {
  font: inherit;
}

.studio {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 260px minmax(360px, 1fr) minmax(420px, 1.2fr);
  gap: 12px;
  padding: 12px;
}

.panel {
  min-width: 0;
  border: 1px solid #d5dde7;
  border-radius: 8px;
  background: #ffffff;
  padding: 14px;
  overflow: hidden;
}

.stack,
.prompt-form {
  display: grid;
  gap: 8px;
}

.list {
  display: grid;
  gap: 6px;
  margin-top: 12px;
}

.selected {
  outline: 2px solid #2670a8;
}

.conversation-panel {
  display: grid;
  grid-template-rows: auto minmax(120px, 1fr) minmax(120px, 1fr) auto;
  gap: 10px;
}

.messages,
.logs,
.file-viewer {
  overflow: auto;
  border: 1px solid #e1e7ef;
  border-radius: 6px;
  background: #f8fafc;
  padding: 10px;
}

.message {
  margin-bottom: 8px;
  line-height: 1.5;
}

.logs pre,
.file-viewer {
  margin: 0;
  white-space: pre-wrap;
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 12px;
}

.prompt-form textarea {
  min-height: 84px;
  resize: vertical;
}

.toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
}

.workspace-grid {
  height: calc(100vh - 86px);
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 10px;
}

.file-tree {
  margin: 0;
  padding-left: 16px;
  overflow: auto;
}

.file-tree button {
  border: 0;
  background: transparent;
  color: #155f91;
  cursor: pointer;
}

@media (max-width: 1080px) {
  .studio {
    grid-template-columns: 1fr;
  }

  .workspace-grid {
    height: auto;
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 5: Run web checks**

Run:

```powershell
npm install
npm test --workspace apps/web
npm run typecheck --workspace apps/web
npm run build --workspace apps/web
```

Expected: tests, typecheck, and build pass.

- [ ] **Step 6: Commit**

```powershell
git add package-lock.json apps/web
git commit -m "feat: add studio web app"
```

### Task 12: End-To-End Local MVP Verification

**Files:**
- Modify: `README.md`
- Create: `docs/local-development.md`

- [ ] **Step 1: Document local development**

Create `docs/local-development.md`:

````md
# Local Development

## Run Phase 1 With Fake Agent

```powershell
npm install
$env:AGENT_PROVIDER="fake"
npm run dev:api
```

In another terminal:

```powershell
npm run dev:web
```

Open `http://127.0.0.1:5173`.

## Run Phase 2 With OpenCode

OpenCode model provider configuration is owned by OpenCode. Configure DeepSeek or another provider in OpenCode before using this app.

```powershell
$env:AGENT_PROVIDER="opencode"
$env:OPENCODE_COMMAND="opencode"
$env:OPENCODE_AGENT="build"
npm run dev:api
```
````

- [ ] **Step 2: Update README**

Add a short section linking to `docs/local-development.md` and restating that parent course files are outside this Git repository boundary.

- [ ] **Step 3: Run full checks**

Run:

```powershell
npm test
npm run typecheck
npm run build
```

Expected: all workspace tests pass, TypeScript emits no errors, and build succeeds.

- [ ] **Step 4: Run manual acceptance with fake runner**

Run API:

```powershell
$env:AGENT_PROVIDER="fake"
npm run dev:api
```

Run web in another terminal:

```powershell
npm run dev:web
```

Manual checks:

- Create project named `Todo App`.
- Send prompt `Build a todo app with add, complete, delete, and filter controls`.
- Confirm logs appear.
- Confirm `src/App.tsx` appears in the file tree.
- Confirm file content opens.
- Start preview.
- Confirm preview URL is returned.

- [ ] **Step 5: Commit**

```powershell
git add README.md docs/local-development.md
git commit -m "docs: add local development workflow"
```

## Spec Coverage Review

- Project creation from Web Studio: Task 6 and Task 11.
- Template copy into `workspaces/{projectId}`: Task 5 and Task 6.
- Persist projects, conversations, messages, Agent runs, logs: Task 4 and Task 7.
- Fake runner for deterministic Phase 1: Task 7.
- OpenCode runner using user-configured provider: Task 7 and Task 12.
- WebSocket log streaming: Task 8.
- File tree and file content: Task 9 and Task 11.
- Preview process and URL: Task 10 and Task 11.
- Path traversal protection: Task 9.
- Local docs and repository boundary: Task 12.

## Execution Notes

- Keep all work inside `D:\doc\code\apiFlow项目课程\ai-app-generator-mvp`.
- Do not run Git commands from the parent course directory.
- Do not commit `workspaces/`, `storage/`, generated apps, videos, PDFs, zip files, or extracted frames.
- Do not store DeepSeek or other model provider credentials in this repository.
- Do not pass `--model` to OpenCode in MVP; let OpenCode use the user's active configuration.
