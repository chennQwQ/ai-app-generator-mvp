import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { openDatabase } from "../src/db/database.js";
import { createServer } from "../src/server.js";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe("internal agent run routes", () => {
  it("starts an agent run for the project workspace requested by ApiFlow", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-internal-agent-"));
    const config = loadConfig({
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces"),
      TEMPLATES_DIR: path.resolve(process.cwd(), "templates"),
      AGENT_PROVIDER: "fake"
    });
    const app = await createServer(config);

    try {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/projects",
        payload: { name: "Internal Agent Project" }
      });
      const project = createRes.json();

      const response = await app.inject({
        method: "POST",
        url: "/internal/agent-runs",
        payload: {
          projectId: project.id,
          workflowRunId: "workflow-run-1",
          nodeId: "node_run_opencode",
          prompt: "Build from ApiFlow"
        }
      });

      expect(response.statusCode).toBe(202);
      const body = response.json();
      expect(body.nodeId).toBe("node_run_opencode");
      expect(body.workflowRunId).toBe("workflow-run-1");
      expect(body.run).toMatchObject({
        projectId: project.id,
        status: "running",
        prompt: "Build from ApiFlow",
        command: "fake"
      });

      const db = openDatabase(path.join(config.storageDir, "app.sqlite"));
      try {
        const run = await waitFor(() => {
          const row = db.prepare("select * from agent_runs where id = ?").get(body.run.id) as any;
          return row?.status === "succeeded" ? row : undefined;
        });
        expect(run.exit_code).toBe(0);
        const logs = db.prepare("select * from agent_logs where agent_run_id = ? order by sequence").all(body.run.id);
        expect(logs.length).toBeGreaterThan(0);
      } finally {
        db.close();
      }

      const fileResponse = await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/files/content?path=${encodeURIComponent("src/App.tsx")}`
      });
      expect(fileResponse.statusCode).toBe(200);
      expect(fileResponse.json().content).toContain("Build from ApiFlow");
    } finally {
      await app.close();
    }
  });
});

async function waitFor<T>(read: () => T | undefined): Promise<T> {
  const deadline = Date.now() + 2_000;
  let value = read();
  while (!value && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    value = read();
  }
  if (!value) throw new Error("Timed out waiting for condition");
  return value;
}
