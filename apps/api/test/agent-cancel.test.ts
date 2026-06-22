import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { createServer } from "../src/server.js";
import type { AgentRun } from "@ai-app-generator/shared";
import { EventBus } from "../src/events/event-bus.js";
import { FakeAgentRunner } from "../src/agent/agent-runner.js";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe("agent cancel", () => {
  it("FakeAgentRunner returns cancelled status after cancel is called", async () => {
    const bus = new EventBus();
    const runner = new FakeAgentRunner({} as any, bus);

    const runPromise = runner.run({
      projectId: "test-project",
      runId: "test-run",
      workspacePath: process.cwd(),
      prompt: "build something",
      onLog: () => {}
    });

    runner.cancel("test-run");
    const result = await runPromise;

    expect(result.exitCode).not.toBe(0);
  });

  it("cancel route returns 202 and marks the run as cancelled", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-cancel-"));
    const config = loadConfig({
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces"),
      TEMPLATE_DIR: path.resolve(process.cwd(), "templates/react-vite")
    });
    const app = await createServer(config);

    const projectRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Cancel App" }
    });
    const project = projectRes.json();

    const msgRes = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/messages`,
      payload: { content: "Build a counter" }
    });
    expect(msgRes.statusCode).toBe(202);
    const run: AgentRun = msgRes.json().run;

    const cancelRes = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/runs/${run.id}/cancel`
    });

    expect(cancelRes.statusCode).toBe(202);
    const cancelledRun: AgentRun = cancelRes.json().run;
    expect(cancelledRun.status).toBe("cancelled");

    await app.close();
  });

  it("cancel returns 404 for a nonexistent run", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-cancel-"));
    const config = loadConfig({
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces"),
      TEMPLATE_DIR: path.resolve(process.cwd(), "templates/react-vite")
    });
    const app = await createServer(config);

    const projectRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Empty App" }
    });
    const project = projectRes.json();

    const res = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/runs/nonexistent/cancel`
    });

    expect(res.statusCode).toBe(404);

    await app.close();
  });

  it("cancel returns 409 for an already-completed run", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-cancel-"));
    const config = loadConfig({
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces"),
      TEMPLATE_DIR: path.resolve(process.cwd(), "templates/react-vite")
    });
    const app = await createServer(config);

    const projectRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Done App" }
    });
    const project = projectRes.json();

    const msgRes = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/messages`,
      payload: { content: "Build fast" }
    });
    expect(msgRes.statusCode).toBe(202);
    const run: AgentRun = msgRes.json().run;

    await new Promise((resolve) => setTimeout(resolve, 200));

    const cancelRes = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/runs/${run.id}/cancel`
    });

    expect(cancelRes.statusCode).toBe(409);
    expect(cancelRes.json().message).toMatch(/not active/);

    await app.close();
  });
});
