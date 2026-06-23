import { existsSync, readdirSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { openDatabase } from "../src/db/database.js";
import { ProjectService } from "../src/projects/project-service.js";
import { TemplateService } from "../src/templates/template-service.js";
import { registerProjectRoutes } from "../src/routes/projects.js";
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
      APP_ROOT: path.resolve(process.cwd()),
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces")
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
    expect(existsSync(path.join(config.workspaceDir, project.id, "package.json"))).toBe(true);
    expect(existsSync(path.join(config.workspaceDir, project.id, "src", "App.tsx"))).toBe(true);
    expect(existsSync(path.join(config.workspaceDir, project.id, "src", "App.vue"))).toBe(false);

    const list = await app.inject({ method: "GET", url: "/api/projects" });
    expect(list.json()).toHaveLength(1);

    await app.close();
  });

  it("rolls back the project row and workspace when conversation creation fails", () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-projects-"));
    const config = loadConfig({
      APP_ROOT: path.resolve(process.cwd()),
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces")
    });
    const db = openDatabase(path.join(config.storageDir, "app.sqlite"));
    db.exec(`
      create trigger fail_conversation_insert
      before insert on conversations
      begin
        select raise(abort, 'forced conversation insert failure');
      end;
    `);
    const projects = new ProjectService(db, config, new TemplateService(config.templatesDir));
    expect(() => projects.createProject("Broken App")).toThrow("forced conversation insert failure");
    expect(db.prepare("select count(*) as count from projects").get()).toEqual({ count: 0 });
    expect(readdirSync(config.workspaceDir)).toHaveLength(0);

    db.close();
  });

  it("resets active preview state on startup", () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-projects-"));
    const config = loadConfig({
      APP_ROOT: path.resolve(process.cwd()),
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces")
    });
    const db = openDatabase(path.join(config.storageDir, "app.sqlite"));
    const projects = new ProjectService(db, config, new TemplateService(config.templatesDir));
    const project = projects.createProject("Preview Reset App");

    projects.updatePreview(project.id, {
      status: "running",
      port: 6200,
      url: "http://127.0.0.1:6200"
    });
    projects.resetActivePreviews();

    expect(projects.getProject(project.id)).toMatchObject({
      previewStatus: "stopped",
      previewPort: null
    });

    db.close();
  });

  it("returns a generic creation error when template copy fails", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-projects-"));
    const templatesDir = path.join(tempDir, "templates");
    const config = loadConfig({
      APP_ROOT: path.resolve(process.cwd()),
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces"),
      TEMPLATES_DIR: templatesDir
    });
    const app = await createServer(config);

    const response = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Broken App" }
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ message: "Project creation failed" });
    const body = response.body;
    expect(body).not.toContain(templatesDir);
    expect(body).not.toContain("ENOENT");
    expect(body).not.toContain("no such file or directory");

    await app.close();
  });

  it("returns 400 when creating a project without a payload", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-projects-"));
    const config = loadConfig({
      APP_ROOT: path.resolve(process.cwd()),
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces")
    });
    const app = await createServer(config);

    const response = await app.inject({
      method: "POST",
      url: "/api/projects"
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ message: "Project name is required" });

    await app.close();
  });

  it("returns 400 when creating a project with a non-string name", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-projects-"));
    const config = loadConfig({
      APP_ROOT: path.resolve(process.cwd()),
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces")
    });
    const app = await createServer(config);

    const response = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: 123 }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ message: "Project name is required" });

    await app.close();
  });

  it("returns a generic listing error when project listing fails", async () => {
    const app = Fastify({ logger: false });
    await registerProjectRoutes(app, {
      listProjects: () => {
        throw new Error("raw db path C:\\secret\\app.sqlite");
      },
      getProject: () => {
        throw new Error("database unavailable");
      },
      getWorkspacePath: () => {
        throw new Error("database unavailable");
      },
      createProject: () => {
        throw new Error("database unavailable");
      }
    } as unknown as ProjectService);

    const response = await app.inject({ method: "GET", url: "/api/projects" });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ message: "Project listing failed" });
    expect(response.body).not.toContain("secret");
    expect(response.body).not.toContain("sqlite");

    await app.close();
  });

  it("does not turn unexpected project lookup errors into 404 responses", async () => {
    const app = Fastify({ logger: false });
    await registerProjectRoutes(app, {
      listProjects: () => [],
      getProject: () => {
        throw new Error("database unavailable");
      },
      getWorkspacePath: () => {
        throw new Error("database unavailable");
      },
      createProject: () => {
        throw new Error("database unavailable");
      }
    } as unknown as ProjectService);

    const response = await app.inject({ method: "GET", url: "/api/projects/example" });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ message: "Project lookup failed" });

    await app.close();
  });

  it("deletes a project and returns 200", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-projects-"));
    const config = loadConfig({
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces")
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
      WORKSPACE_DIR: path.join(tempDir, "workspaces")
    });
    const app = await createServer(config);

    const res = await app.inject({ method: "DELETE", url: "/api/projects/nonexistent" });
    expect(res.statusCode).toBe(404);

    await app.close();
  });

  it("creates a project with a vue template", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-projects-"));
    const config = loadConfig({
      APP_ROOT: path.resolve(process.cwd()),
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
    expect(existsSync(path.join(config.workspaceDir, project.id, "src", "App.vue"))).toBe(true);
    expect(existsSync(path.join(config.workspaceDir, project.id, "src", "App.tsx"))).toBe(false);
    await app.close();
  });

  it("creates a project with an explicit react template", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-projects-"));
    const config = loadConfig({
      APP_ROOT: path.resolve(process.cwd()),
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces"),
      TEMPLATES_DIR: path.resolve(process.cwd(), "templates")
    });
    const app = await createServer(config);

    const response = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "React App", template: "react-vite" }
    });

    expect(response.statusCode).toBe(201);
    const project = response.json();
    expect(project.name).toBe("React App");
    expect(existsSync(path.join(config.workspaceDir, project.id, "src", "App.tsx"))).toBe(true);
    expect(existsSync(path.join(config.workspaceDir, project.id, "src", "App.vue"))).toBe(false);
    await app.close();
  });

  it("rejects unknown template ids", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-projects-"));
    const config = loadConfig({
      APP_ROOT: path.resolve(process.cwd()),
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces"),
      TEMPLATES_DIR: path.resolve(process.cwd(), "templates")
    });
    const app = await createServer(config);

    const response = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Bad", template: "nonexistent" }
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
