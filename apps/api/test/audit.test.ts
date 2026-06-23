import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { AuditService } from "../src/audit/audit-service.js";
import { openDatabase } from "../src/db/database.js";
import { createServer } from "../src/server.js";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe("audit routes", () => {
  it("returns an empty audit list when no runs have been made", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-audit-"));
    const config = loadConfig({
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces")
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

  it("records fake agent tool calls for a run", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-audit-"));
    const config = loadConfig({
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces"),
      AGENT_PROVIDER: "fake"
    });
    const app = await createServer(config);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Audited Run" }
    });
    const project = createRes.json();
    const messageRes = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/messages`,
      payload: { content: "Build an audited app" }
    });
    expect(messageRes.statusCode).toBe(202);
    const run = messageRes.json().run;

    const auditLogs = await waitFor(async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/audit`
      });
      const logs = response.json();
      return logs.length > 0 ? logs : undefined;
    });

    expect(auditLogs).toEqual([
      expect.objectContaining({
        projectId: project.id,
        runId: run.id,
        toolName: "file_write",
        parameters: {
          path: "src/App.tsx",
          content: expect.stringContaining("Build an audited app")
        },
        exitCode: 0,
        output: null
      })
    ]);

    await waitFor(async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/runs`
      });
      const runs = response.json();
      return runs.find((agentRun: any) => agentRun.id === run.id && agentRun.status === "succeeded");
    });

    await app.close();
  });

  it("records Vue fake agent writes against App.vue", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-audit-"));
    const config = loadConfig({
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces"),
      AGENT_PROVIDER: "fake"
    });
    const app = await createServer(config);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Audited Vue Run", template: "vue-vite" }
    });
    const project = createRes.json();
    const prompt = "Build an audited Vue app";
    const messageRes = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/messages`,
      payload: { content: prompt }
    });
    expect(messageRes.statusCode).toBe(202);
    const run = messageRes.json().run;

    await waitFor(async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/runs`
      });
      const runs = response.json();
      return runs.find((agentRun: any) => agentRun.id === run.id && agentRun.status === "succeeded");
    });

    const fileResponse = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/files/content?path=${encodeURIComponent("src/App.vue")}`
    });
    expect(fileResponse.statusCode).toBe(200);
    expect(fileResponse.json().content).toContain(prompt);

    const auditResponse = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/audit`
    });
    expect(auditResponse.json()).toEqual([
      expect.objectContaining({
        projectId: project.id,
        runId: run.id,
        toolName: "file_write",
        parameters: {
          path: "src/App.vue",
          content: expect.stringContaining(prompt)
        },
        exitCode: 0
      })
    ]);

    await app.close();
  });

  it("ignores audit writes after the audit service is closed", () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-audit-"));
    const db = openDatabase(path.join(tempDir, "storage", "app.sqlite"));
    const audit = new AuditService(db);
    let dbClosed = false;

    try {
      audit.close();
      db.close();
      dbClosed = true;

      expect(() =>
        audit.recordLog({
          projectId: "project-1",
          runId: "run-1",
          toolName: "file_write",
          parameters: { path: "src/App.tsx", content: "content" },
          exitCode: 0
        })
      ).not.toThrow();
    } finally {
      audit.close();
      if (!dbClosed) db.close();
    }
  });
});

async function waitFor<T>(read: () => Promise<T | undefined>): Promise<T> {
  const deadline = Date.now() + 2_000;
  let value = await read();
  while (!value && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    value = await read();
  }
  if (!value) throw new Error("Timed out waiting for condition");
  return value;
}
