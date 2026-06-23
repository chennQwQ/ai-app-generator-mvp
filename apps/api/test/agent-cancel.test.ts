import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { openDatabase } from "../src/db/database.js";
import { createServer } from "../src/server.js";
import type { AgentRun } from "@ai-app-generator/shared";
import { EventBus } from "../src/events/event-bus.js";
import { FakeAgentRunner, type AgentRunResult, type AgentRunner } from "../src/agent/agent-runner.js";
import { ProjectService } from "../src/projects/project-service.js";
import { TemplateService } from "../src/templates/template-service.js";
import { ConversationService } from "../src/conversations/conversation-service.js";
import { registerMessageRoutes } from "../src/routes/messages.js";
import { registerRunRoutes } from "../src/routes/runs.js";

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
      WORKSPACE_DIR: path.join(tempDir, "workspaces")
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

  it("does not overwrite a cancelled run when the runner settles later", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-cancel-"));
    const config = loadConfig({
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces")
    });
    const app = Fastify({ logger: false });
    const db = openDatabase(path.join(config.storageDir, "app.sqlite"));
    const bus = new EventBus();
    const projects = new ProjectService(db, config, new TemplateService(config.templatesDir));
    const conversations = new ConversationService(db);
    const runner = new ControlledRunner();
    await registerMessageRoutes(app, projects, conversations, runner, bus);
    await registerRunRoutes(app, projects, conversations, runner, bus);

    try {
      const project = projects.createProject("Cancel Race App");

      const msgRes = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/messages`,
        payload: { content: "Build slowly" }
      });
      expect(msgRes.statusCode).toBe(202);
      const run: AgentRun = msgRes.json().run;

      const cancelRes = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/runs/${run.id}/cancel`
      });
      expect(cancelRes.statusCode).toBe(202);

      runner.complete({ exitCode: 1, errorMessage: "Cancelled" });
      await runner.done;

      expect(conversations.getAgentRun(run.id).status).toBe("cancelled");
    } finally {
      db.close();
      await app.close();
    }
  });

  it("cancel returns 404 for a nonexistent run", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-cancel-"));
    const config = loadConfig({
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces")
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
      WORKSPACE_DIR: path.join(tempDir, "workspaces")
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

class ControlledRunner implements AgentRunner {
  readonly command = "controlled";
  private resolveRun!: (result: AgentRunResult) => void;
  private resolveDone!: () => void;
  readonly done: Promise<void>;

  constructor() {
    this.done = new Promise<void>((resolve) => {
      this.resolveDone = resolve;
    });
  }

  run(): Promise<AgentRunResult> {
    return new Promise((resolve) => {
      this.resolveRun = (result) => {
        resolve(result);
        this.resolveDone();
      };
    });
  }

  complete(result: AgentRunResult): void {
    this.resolveRun(result);
  }

  cancel(): void {}

  async healthCheck(): Promise<{ ok: boolean }> {
    return { ok: true };
  }
}
