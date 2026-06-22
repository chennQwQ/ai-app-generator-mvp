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

describe("run routes", () => {
  it("returns agent run history for a project", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-runs-"));
    const config = loadConfig({
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces"),
      TEMPLATE_DIR: path.resolve(process.cwd(), "templates/react-vite")
    });
    const app = await createServer(config);

    const projectRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Run App" }
    });
    const project = projectRes.json();

    const msgRes = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/messages`,
      payload: { content: "Build a counter" }
    });
    expect(msgRes.statusCode).toBe(202);

    const listRes = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/runs`
    });

    expect(listRes.statusCode).toBe(200);
    const runs = listRes.json();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      projectId: project.id,
      prompt: "Build a counter"
    });

    await app.close();
  });

  it("returns 404 for a missing project", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-runs-"));
    const config = loadConfig({
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces"),
      TEMPLATE_DIR: path.resolve(process.cwd(), "templates/react-vite")
    });
    const app = await createServer(config);

    const res = await app.inject({
      method: "GET",
      url: "/api/projects/nonexistent/runs"
    });

    expect(res.statusCode).toBe(404);

    await app.close();
  });

  it("returns run logs for a specific run", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-runs-"));
    const config = loadConfig({
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces"),
      TEMPLATE_DIR: path.resolve(process.cwd(), "templates/react-vite")
    });
    const app = await createServer(config);

    const projectRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Log App" }
    });
    const project = projectRes.json();

    const msgRes = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/messages`,
      payload: { content: "Build a counter" }
    });
    expect(msgRes.statusCode).toBe(202);
    const run = msgRes.json().run;

    const logsRes = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/runs/${run.id}/logs`
    });

    expect(logsRes.statusCode).toBe(200);
    const logs = logsRes.json();
    expect(Array.isArray(logs)).toBe(true);
    for (const log of logs) {
      expect(log).toHaveProperty("content");
      expect(log.agentRunId).toBe(run.id);
    }

    await app.close();
  });

  it("returns 404 for run logs of a missing run", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-runs-"));
    const config = loadConfig({
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces"),
      TEMPLATE_DIR: path.resolve(process.cwd(), "templates/react-vite")
    });
    const app = await createServer(config);

    const projectRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Missing Run App" }
    });
    const project = projectRes.json();

    const res = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/runs/nonexistent/logs`
    });

    expect(res.statusCode).toBe(404);

    await app.close();
  });
});
