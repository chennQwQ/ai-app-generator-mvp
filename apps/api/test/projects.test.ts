import { existsSync } from "node:fs";
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
      APP_ROOT: path.resolve(process.cwd()),
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
    expect(existsSync(path.join(config.workspaceDir, project.id, "package.json"))).toBe(true);

    const list = await app.inject({ method: "GET", url: "/api/projects" });
    expect(list.json()).toHaveLength(1);

    await app.close();
  });
});
