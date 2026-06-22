# AI App Generator Phase 4 Implementation Plan — Templates And Tools

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the project creation pipeline per the design spec Phase 4: add a Vue Vite template, template metadata with a list API, template selection UI on the frontend, structured tool definitions for Agent runtime, and audit history for tool calls.

**Architecture:** New backend module `apps/api/src/templates/template-service.ts` owns the template registry, metadata, and directory resolution. One new DB table `audit_logs` in `apps/api/src/db/schema.ts`. One new route `GET /api/templates` and one new route `GET /api/projects/:id/audit`. Frontend adds a template dropdown in the project creation form. The monorepo boundary, npm workspaces, and existing conventions remain unchanged.

**Tech Stack:** Node.js, TypeScript, Fastify, better-sqlite3, Vitest, React 19, Vite (existing).

---

## File Structure (phase 4 changes only)

Files to create:
- `templates/vue-vite/package.json` — Vue Vite scaffold package.
- `templates/vue-vite/index.html` — App shell.
- `templates/vue-vite/vite.config.ts` — Vite config with vue plugin.
- `templates/vue-vite/tsconfig.json` — TypeScript config for Vue.
- `templates/vue-vite/env.d.ts` — Vue SFC type shims.
- `templates/vue-vite/src/main.ts` — Vue app entry.
- `templates/vue-vite/src/App.vue` — Starter Vue component.
- `templates/vue-vite/src/styles.css` — Starter styles.
- `apps/api/src/templates/template-service.ts` — Template registry, metadata, directory resolution.
- `apps/api/src/audit/audit-service.ts` — Audit log persistence.
- `apps/api/src/routes/templates.ts` — `GET /api/templates` route.
- `apps/api/src/routes/audit.ts` — `GET /api/projects/:id/audit` route.

Files to modify:
- `packages/shared/src/index.ts` — Add `TemplateMeta`, `ToolDefinition`, `AuditLog` types.
- `apps/api/src/db/schema.ts` — Add `audit_logs` table.
- `apps/api/src/config.ts` — Change `templateDir` to `templatesDir` (points to `./templates`).
- `apps/api/src/projects/project-service.ts` — Accept `template` param in `createProject()`.
- `apps/api/src/routes/projects.ts` — Parse `template` from POST body.
- `apps/api/src/agent/agent-runner.ts` — Add audit logging calls during agent run.
- `apps/api/src/server.ts` — Wire template service, audit service, new routes.
- `apps/api/test/template.test.ts` — Add vue-vite + template list tests.
- `apps/api/test/projects.test.ts` — Add project creation with template tests.
- `apps/api/test/database.test.ts` — Verify `audit_logs` table exists.
- `apps/web/src/api.ts` — Add `listTemplates()`, accept `template` in `createProject()`.
- `apps/web/src/App.tsx` — Add template dropdown in create-project form.
- `apps/web/src/styles.css` — Template dropdown styles.
- `apps/web/src/App.test.tsx` — Template selection tests.

`workspaces/`, `storage/`, dependencies, and build outputs stay ignored by Git.

---

## Implementation Tasks

### Task 19: Vue Vite Template

**Files:**
- Create: `templates/vue-vite/package.json`
- Create: `templates/vue-vite/index.html`
- Create: `templates/vue-vite/vite.config.ts`
- Create: `templates/vue-vite/tsconfig.json`
- Create: `templates/vue-vite/env.d.ts`
- Create: `templates/vue-vite/src/main.ts`
- Create: `templates/vue-vite/src/App.vue`
- Create: `templates/vue-vite/src/styles.css`
- Modify: `apps/api/test/template.test.ts` — add vue-vite existence check.

- [ ] **Step 1: Write failing vue-vite template test**

In `apps/api/test/template.test.ts`, add:

```ts
describe("vue vite template", () => {
  it("contains the files required for preview", () => {
    const root = path.resolve(process.cwd(), "templates/vue-vite");
    expect(existsSync(path.join(root, "package.json"))).toBe(true);
    expect(existsSync(path.join(root, "index.html"))).toBe(true);
    expect(existsSync(path.join(root, "src/App.vue"))).toBe(true);
    expect(existsSync(path.join(root, "src/main.ts"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** (directory not found)

```powershell
npm test --workspace apps/api -- template.test.ts
```

- [ ] **Step 3: Create template files**

Create `templates/vue-vite/package.json`:

```json
{
  "name": "generated-vue-app",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc -b && vite build",
    "typecheck": "vue-tsc -b"
  },
  "dependencies": {
    "vue": "^3.5.13"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.2.1",
    "typescript": "^5.6.3",
    "vite": "^6.0.5",
    "vue-tsc": "^2.2.0"
  }
}
```

Create `templates/vue-vite/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Generated Vue App</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

Create `templates/vue-vite/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()]
});
```

Create `templates/vue-vite/tsconfig.json`:

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
    "jsx": "preserve"
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "env.d.ts"]
}
```

Create `templates/vue-vite/env.d.ts`:

```ts
/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
```

Create `templates/vue-vite/src/main.ts`:

```ts
import { createApp } from "vue";
import App from "./App.vue";
import "./styles.css";

createApp(App).mount("#app");
```

Create `templates/vue-vite/src/App.vue`:

```vue
<script setup lang="ts">
const message = "Ready for OpenCode";
</script>

<template>
  <main class="app-shell">
    <section class="panel">
      <p class="eyebrow">Generated Vue App</p>
      <h1>{{ message }}</h1>
      <p>
        This starter app is intentionally small so the Agent can reshape it
        into the application requested by the user.
      </p>
    </section>
  </main>
</template>
```

Create `templates/vue-vite/src/styles.css`:

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

- [ ] **Step 4: Run template test**

```powershell
npm test --workspace apps/api -- template.test.ts
```

Expected: both react-vite and vue-vite template tests pass.

- [ ] **Step 5: Commit**

```powershell
git add templates/vue-vite apps/api/test/template.test.ts
git commit -m "feat: add vue vite template"
```

---

### Task 20: Template Metadata And List API

**Files:**
- Create: `apps/api/src/templates/template-service.ts`
- Create: `apps/api/src/routes/templates.ts`
- Modify: `packages/shared/src/index.ts` — add `TemplateMeta` type.
- Modify: `apps/api/src/server.ts` — wire template routes.
- Modify: `apps/api/test/template.test.ts` — add template list API test.

- [ ] **Step 1: Write failing template list test**

Add to `apps/api/test/template.test.ts`:

```ts
import { loadConfig } from "../src/config.js";
import { createServer } from "../src/server.js";

describe("template list api", () => {
  it("returns available templates with metadata", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-templates-"));
    const config = loadConfig({
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces"),
      TEMPLATES_DIR: path.resolve(process.cwd(), "templates")
    });
    const app = await createServer(config);

    const response = await app.inject({ method: "GET", url: "/api/templates" });
    expect(response.statusCode).toBe(200);
    const templates = response.json();
    expect(templates).toBeInstanceOf(Array);
    expect(templates.length).toBeGreaterThanOrEqual(2);
    expect(templates.find((t: any) => t.id === "react-vite")).toBeDefined();
    expect(templates.find((t: any) => t.id === "vue-vite")).toBeDefined();
    await app.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** (route not found)

```powershell
npm test --workspace apps/api -- template.test.ts
```

- [ ] **Step 3: Add `TemplateMeta` to shared types**

Add to `packages/shared/src/index.ts`:

```ts
export interface TemplateMeta {
  id: string;
  name: string;
  description: string;
}
```

- [ ] **Step 4: Create template service**

Create `apps/api/src/templates/template-service.ts`:

```ts
import path from "node:path";
import type { TemplateMeta } from "@ai-app-generator/shared";

export interface TemplateEntry {
  id: string;
  name: string;
  description: string;
  dir: string;
}

export class TemplateService {
  private readonly templates: TemplateEntry[];

  constructor(private readonly templatesDir: string) {
    this.templates = [
      {
        id: "react-vite",
        name: "React (Vite + TypeScript)",
        description: "React 19 app with Vite, TypeScript, and strict mode",
        dir: path.resolve(templatesDir, "react-vite")
      },
      {
        id: "vue-vite",
        name: "Vue (Vite + TypeScript)",
        description: "Vue 3 app with Vite, TypeScript, and Composition API",
        dir: path.resolve(templatesDir, "vue-vite")
      }
    ];
  }

  list(): TemplateMeta[] {
    return this.templates.map(({ id, name, description }) => ({ id, name, description }));
  }

  getTemplate(id: string): TemplateEntry {
    const template = this.templates.find((t) => t.id === id);
    if (!template) throw new Error(`Unknown template: ${id}`);
    return template;
  }

  resolveDir(id: string): string {
    return this.getTemplate(id).dir;
  }
}
```

- [ ] **Step 5: Create template routes**

Create `apps/api/src/routes/templates.ts`:

```ts
import type { FastifyInstance } from "fastify";
import type { TemplateService } from "../templates/template-service.js";

export async function registerTemplateRoutes(app: FastifyInstance, templates: TemplateService) {
  app.get("/api/templates", async (request, reply) => {
    try {
      return templates.list();
    } catch (error) {
      request.log.error({ err: error }, "Template listing failed");
      return reply.code(500).send({ message: "Template listing failed" });
    }
  });
}
```

- [ ] **Step 6: Update `config.ts` — `templateDir` → `templatesDir`**

Change in `apps/api/src/config.ts`:

```ts
export interface AppConfig {
  // ... existing fields ...
  templatesDir: string; // was templateDir
}

export function loadConfig(...): AppConfig {
  return {
    // ...
    templatesDir: path.resolve(appRoot, env.TEMPLATES_DIR ?? "./templates"), // was TEMPLATE_DIR
    // ...
  };
}
```

- [ ] **Step 7: Wire in `server.ts`**

In `apps/api/src/server.ts`, import and register:

```ts
import { TemplateService } from "./templates/template-service.js";
import { registerTemplateRoutes } from "./routes/templates.js";

// inside createServer:
const templates = new TemplateService(config.templatesDir);
await registerTemplateRoutes(app, templates);
```

- [ ] **Step 8: Run template tests**

```powershell
npm test --workspace apps/api -- template.test.ts
```

- [ ] **Step 9: Commit**

```powershell
git add packages/shared/src/index.ts apps/api/src/templates apps/api/src/routes/templates.ts apps/api/src/config.ts apps/api/src/server.ts apps/api/test/template.test.ts
git commit -m "feat: add template metadata and list api"
```

---

### Task 21: Template Selection In Project Creation

**Files:**
- Modify: `apps/api/src/projects/project-service.ts` — accept `template` param.
- Modify: `apps/api/src/routes/projects.ts` — parse `template` from body.
- Modify: `apps/api/test/projects.test.ts` — test template selection.
- Modify: `apps/web/src/api.ts` — add `listTemplates()`, `template` param to `createProject()`.
- Modify: `apps/web/src/App.tsx` — dropdown in create-project form.
- Modify: `apps/web/src/styles.css` — dropdown styles.
- Modify: `apps/web/src/App.test.tsx` — template dropdown tests.

- [ ] **Step 1: Write failing API test for template param**

In `apps/api/test/projects.test.ts`, add:

```ts
it("creates a project with a specific template", async () => {
  tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-projects-"));
  const config = loadConfig({
    STORAGE_DIR: path.join(tempDir, "storage"),
    WORKSPACE_DIR: path.join(tempDir, "workspaces"),
    TEMPLATES_DIR: path.resolve(process.cwd(), "templates")
  });
  const app = await createServer(config);

  const response = await app.inject({
    method: "POST",
    url: "/api/projects",
    payload: { name: "Vue App", template: "vue-vite" }
  });

  expect(response.statusCode).toBe(201);
  const project = response.json();
  expect(project.name).toBe("Vue App");
  await app.close();
});
```

- [ ] **Step 2: Run test to verify it fails** (template param ignored)

```powershell
npm test --workspace apps/api -- projects.test.ts
```

- [ ] **Step 3: Update `project-service.ts` createProject**

Change `createProject(name: string)` to `createProject(name: string, template = "react-vite")`:

```ts
createProject(name: string, template = "react-vite"): ProjectSummary {
  const templateDir = this.templates.resolveDir(template);
  // use templateDir instead of this.config.templateDir
}
```

The constructor needs `TemplateService`:

```ts
constructor(
  private readonly db: Database.Database,
  private readonly config: AppConfig,
  private readonly templates: TemplateService
) {}
```

- [ ] **Step 4: Update `server.ts` — pass TemplateService to ProjectService**

```ts
const templates = new TemplateService(config.templatesDir);
const projects = new ProjectService(db, config, templates);
```

- [ ] **Step 5: Update routes to parse template**

In `apps/api/src/routes/projects.ts`, change POST body parsing:

```ts
const template =
  body && typeof body === "object" && "template" in body && typeof body.template === "string"
    ? body.template.trim()
    : "react-vite";
const project = projects.createProject(name, template);
```

- [ ] **Step 6: Run API tests**

```powershell
npm test --workspace apps/api -- projects.test.ts template.test.ts
```

- [ ] **Step 7: Frontend — add `listTemplates` and update `createProject`**

In `apps/web/src/api.ts`:

```ts
import type { TemplateMeta } from "@ai-app-generator/shared";

export async function listTemplates(): Promise<TemplateMeta[]> {
  return request<TemplateMeta[]>("/api/templates");
}

export async function createProject(name: string, template?: string): Promise<ProjectSummary> {
  return request<ProjectSummary>("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name, template })
  });
}
```

- [ ] **Step 8: Frontend — add template dropdown in App.tsx**

Add state:

```tsx
const [selectedTemplate, setSelectedTemplate] = useState("react-vite");
const [availableTemplates, setAvailableTemplates] = useState<TemplateMeta[]>([]);
```

Load templates on mount:

```tsx
useEffect(() => {
  listTemplates().then(setAvailableTemplates).catch(() => {});
}, []);
```

Update `handleCreateProject` to pass template:

```tsx
const project = await createProject(projectName, selectedTemplate);
```

Add dropdown in the create-project form:

```tsx
{availableTemplates.length > 0 ? (
  <select value={selectedTemplate} onChange={(e) => setSelectedTemplate(e.target.value)}>
    {availableTemplates.map((t) => (
      <option key={t.id} value={t.id}>{t.name}</option>
    ))}
  </select>
) : null}
```

- [ ] **Step 9: Add template dropdown CSS**

In `apps/web/src/styles.css`:

```css
.template-select {
  border: 1px solid #d7dde4;
  border-radius: 6px;
  background: #ffffff;
  color: #172026;
  font-size: 13px;
  padding: 6px 10px;
  margin-bottom: 8px;
  width: 100%;
}
```

- [ ] **Step 10: Update frontend tests**

Add mock for `GET /api/templates` and test template dropdown.

- [ ] **Step 11: Run all tests**

```powershell
npm test
```

- [ ] **Step 12: Commit**

```powershell
git add apps/api/src/projects/project-service.ts apps/api/src/routes/projects.ts apps/api/src/server.ts apps/api/test/projects.test.ts apps/web/src/api.ts apps/web/src/App.tsx apps/web/src/styles.css apps/web/src/App.test.tsx
git commit -m "feat: add template selection in project creation"
```

---

### Task 22: Tool Definitions

**Files:**
- Modify: `packages/shared/src/index.ts` — add `ToolDefinition` and related types.
- Create: test file or modify agent test for tool schema validation.

- [ ] **Step 1: Write failing tool schema test**

This is primarily a shared-types + validation task. Add to `packages/shared/src/index.test.ts` or new test:

```ts
it("defines shell, file_write, npm_install, and npm_build tools", () => {
  expect(toolDefinitions).toHaveLength(4);
  expect(toolDefinitions.find((t) => t.name === "shell")).toBeDefined();
  expect(toolDefinitions.find((t) => t.name === "file_write")).toBeDefined();
  expect(toolDefinitions.find((t) => t.name === "npm_install")).toBeDefined();
  expect(toolDefinitions.find((t) => t.name === "npm_build")).toBeDefined();
});

it("tool definitions include required schema fields", () => {
  const shell = toolDefinitions.find((t) => t.name === "shell")!;
  expect(shell.parameters).toBeDefined();
  expect(shell.description).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
npm test --workspace packages/shared
```

- [ ] **Step 3: Add tool definition types and definitions**

Add to `packages/shared/src/index.ts`:

```ts
export interface ToolParameter {
  name: string;
  type: "string" | "number" | "boolean";
  description: string;
  required?: boolean;
  default?: string | number | boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
}

export const toolDefinitions: ToolDefinition[] = [
  {
    name: "shell",
    description: "Execute a shell command inside the workspace",
    parameters: [
      { name: "command", type: "string", description: "The shell command to execute", required: true },
      { name: "cwd", type: "string", description: "Working directory relative to workspace root" }
    ]
  },
  {
    name: "file_write",
    description: "Write content to a file in the workspace",
    parameters: [
      { name: "path", type: "string", description: "File path relative to workspace root", required: true },
      { name: "content", type: "string", description: "File content", required: true }
    ]
  },
  {
    name: "npm_install",
    description: "Install npm dependencies in the workspace",
    parameters: [
      { name: "packages", type: "string", description: "Space-separated package names to install" },
      { name: "dev", type: "boolean", description: "Install as devDependency", default: false }
    ]
  },
  {
    name: "npm_build",
    description: "Run the project build script",
    parameters: [
      { name: "script", type: "string", description: "The npm script name", default: "build" }
    ]
  }
];

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return toolDefinitions.find((t) => t.name === name);
}
```

- [ ] **Step 4: Run shared tests**

```powershell
npm test --workspace packages/shared
```

- [ ] **Step 5: Commit**

```powershell
git add packages/shared/src/index.ts packages/shared/src/index.test.ts
git commit -m "feat: add structured tool definitions for agent runtime"
```

---

### Task 23: Audit History

**Files:**
- Create: `apps/api/src/audit/audit-service.ts`
- Create: `apps/api/src/routes/audit.ts`
- Modify: `packages/shared/src/index.ts` — add `AuditLog` type.
- Modify: `apps/api/src/db/schema.ts` — add `audit_logs` table.
- Modify: `apps/api/src/agent/agent-runner.ts` — call audit log during run.
- Modify: `apps/api/src/server.ts` — wire audit service and routes.
- Modify: `apps/api/test/database.test.ts` — verify `audit_logs` table.

- [ ] **Step 1: Write failing audit tests**

Add `AuditLog` to `packages/shared/src/index.ts`:

```ts
export interface AuditLog {
  id: string;
  projectId: string;
  runId: string;
  toolName: string;
  parameters: Record<string, unknown>;
  exitCode: number | null;
  output: string | null;
  createdAt: string;
}
```

Add to `apps/api/test/database.test.ts`:

```ts
expect(tables).toContain("audit_logs");
```

Create `apps/api/test/audit.test.ts`:

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

describe("audit routes", () => {
  it("returns an empty list when no tool calls were recorded", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-audit-"));
    const config = loadConfig({
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces"),
      TEMPLATES_DIR: path.resolve(process.cwd(), "templates")
    });
    const app = await createServer(config);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Audit Test" }
    });
    const project = createRes.json();

    const response = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/audit`
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
    await app.close();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
npm test --workspace apps/api -- audit.test.ts database.test.ts
```

- [ ] **Step 3: Add `audit_logs` table to schema**

In `apps/api/src/db/schema.ts`, add to `db.exec`:

```sql
create table if not exists audit_logs (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  run_id text not null references agent_runs(id) on delete cascade,
  tool_name text not null,
  parameters text not null,
  exit_code integer,
  output text,
  created_at text not null
);

create index if not exists idx_audit_logs_project_id on audit_logs(project_id);
create index if not exists idx_audit_logs_run_id on audit_logs(run_id);
```

- [ ] **Step 4: Create audit service**

Create `apps/api/src/audit/audit-service.ts`:

```ts
import { nanoid } from "nanoid";
import type Database from "better-sqlite3";
import type { AuditLog } from "@ai-app-generator/shared";

export class AuditService {
  constructor(private readonly db: Database.Database) {}

  recordLog(params: {
    projectId: string;
    runId: string;
    toolName: string;
    parameters: Record<string, unknown>;
    exitCode?: number;
    output?: string;
  }): AuditLog {
    const id = nanoid();
    const now = new Date().toISOString();
    this.db.prepare(`
      insert into audit_logs (id, project_id, run_id, tool_name, parameters, exit_code, output, created_at)
      values (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.projectId,
      params.runId,
      params.toolName,
      JSON.stringify(params.parameters),
      params.exitCode ?? null,
      params.output ?? null,
      now
    );
    return this.getLog(id);
  }

  listByProject(projectId: string): AuditLog[] {
    return this.db.prepare(
      "select * from audit_logs where project_id = ? order by created_at asc"
    ).all(projectId).map(mapAuditLog);
  }

  listByRun(runId: string): AuditLog[] {
    return this.db.prepare(
      "select * from audit_logs where run_id = ? order by created_at asc"
    ).all(runId).map(mapAuditLog);
  }

  getLog(id: string): AuditLog {
    const row = this.db.prepare("select * from audit_logs where id = ?").get(id);
    if (!row) throw new Error(`Audit log not found: ${id}`);
    return mapAuditLog(row);
  }
}

function mapAuditLog(row: any): AuditLog {
  return {
    id: row.id,
    projectId: row.project_id,
    runId: row.run_id,
    toolName: row.tool_name,
    parameters: JSON.parse(row.parameters as string),
    exitCode: row.exit_code,
    output: row.output,
    createdAt: row.created_at
  };
}
```

- [ ] **Step 5: Create audit routes**

Create `apps/api/src/routes/audit.ts`:

```ts
import type { FastifyInstance } from "fastify";
import type { AuditService } from "../audit/audit-service.js";
import { ProjectNotFoundError } from "../projects/project-service.js";

export async function registerAuditRoutes(app: FastifyInstance, audit: AuditService) {
  app.get("/api/projects/:projectId/audit", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    try {
      return audit.listByProject(projectId);
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        return reply.code(404).send({ message: "Project not found" });
      }
      request.log.error({ err: error }, "Audit listing failed");
      return reply.code(500).send({ message: "Audit listing failed" });
    }
  });
}
```

- [ ] **Step 6: Wire audit into agent runner**

Inject `AuditService` into `FakeAgentRunner` and `OpenCodeAgentRunner` constructors. Call `audit.recordLog()` for key steps (file writes, shell commands). For `FakeAgentRunner`, record the file write:

```ts
this.audit.recordLog({
  projectId: request.projectId,
  runId: request.runId,
  toolName: "file_write",
  parameters: { path: "src/App.tsx", content: "..." },
  exitCode: 0
});
```

For `OpenCodeAgentRunner`, record the `shell` tool call:

```ts
this.audit.recordLog({
  projectId: request.projectId,
  runId: request.runId,
  toolName: "shell",
  parameters: { command: `${this.config.opencodeCommand} run ...` },
  exitCode: code ?? null,
  output: stderr || null
});
```

- [ ] **Step 7: Wire in `server.ts`**

```ts
import { AuditService } from "./audit/audit-service.js";
import { registerAuditRoutes } from "./routes/audit.js";

const audit = new AuditService(db);
await registerAuditRoutes(app, audit);
```

Pass `audit` to runner factory.

- [ ] **Step 8: Run tests**

```powershell
npm test
```

- [ ] **Step 9: Commit**

```powershell
git add apps/api/src/audit apps/api/src/routes/audit.ts apps/api/src/db/schema.ts apps/api/src/agent/agent-runner.ts apps/api/src/server.ts apps/api/test/audit.test.ts apps/api/test/database.test.ts packages/shared/src/index.ts
git commit -m "feat: add audit history for tool calls"
```

---

### Task 24: End-to-End Phase 4 Verification

**Files:**
- Modify: `docs/local-development.md` — add Phase 4 features.

- [ ] **Step 1: Document new features in local-development.md**

- Vue template selection in project creation.
- Template metadata API (`GET /api/templates`).
- Tool definitions (`shared/toolDefinitions`).
- Audit history (`GET /api/projects/:id/audit`).

- [ ] **Step 2: Run full checks**

```powershell
npm test
npm run typecheck
npm run build
```

- [ ] **Step 3: Manual acceptance checklist**

- Run the API and verify `GET /api/templates` returns both react-vite and vue-vite.
- Create a project with `template: "vue-vite"` — verify workspace contains `.vue` files.
- Create a project with `template: "react-vite"` — verify workspace contains `.tsx` files.
- Open web UI — template dropdown shows React and Vue options.
- After an agent run, check `GET /api/projects/:id/audit` returns recorded tool calls.
- Verify `audit_logs` table exists after schema migration.

- [ ] **Step 4: Commit**

```powershell
git add docs/local-development.md
git commit -m "docs: update local development guide for phase 4 features"
```

---

## Spec Coverage Review

| Design Spec Phase 4 Item | Task |
|--------------------------|------|
| Add built-in React and Vue templates | Tasks 19 (Vue), 21 (React already exists) |
| Add template metadata | Task 20 |
| Add controlled tool definitions for shell, file, install, and build | Task 22 |
| Add audit history for tool calls | Task 23 |

All four Phase 4 requirements are covered by Tasks 19–23 plus E2E verification in Task 24.

## Execution Notes

- Keep all work inside `D:\doc\code\apiFlow项目课程\ai-app-generator-mvp\.worktrees\implement-mvp`.
- Do not run Git commands from the parent course directory.
- Do not commit `workspaces/`, `storage/`, generated apps, videos, PDFs, zip files, or extracted frames.
- Follow the existing code conventions: no comments unless necessary, TDD pattern (red-green-refactor), same error handling wrappers, same import style.
- Each task is independently testable. Rollback is always one `git revert` away.
- Config key `TEMPLATE_DIR` → `TEMPLATES_DIR` is a **breaking env change**. Update `.env.example` and `docs/local-development.md` accordingly.
- The `project-service.ts` constructor gains a `TemplateService` dependency. Update all call sites (in `server.ts` and tests).
- The `agent-runner.ts` gains an `AuditService` dependency. Update runner factory and tests.
