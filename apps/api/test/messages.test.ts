import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, type AppConfig } from "../src/config.js";
import { openDatabase } from "../src/db/database.js";
import { EventBus } from "../src/events/event-bus.js";
import { ProjectService, ProjectNotFoundError } from "../src/projects/project-service.js";
import { registerMessageRoutes } from "../src/routes/messages.js";
import { createAgentRunner } from "../src/agent/agent-runner.js";
import { ConversationService } from "../src/conversations/conversation-service.js";
import { createServer } from "../src/server.js";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe("message routes", () => {
  it("accepts a user message, runs the fake agent, stores logs, and lists messages", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-messages-"));
    const config = testConfig(tempDir);
    const app = await createServer(config);

    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Chat App" }
    });
    const project = projectResponse.json();

    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/messages`,
      payload: { content: "Build me a dashboard" }
    });

    expect(response.statusCode).toBe(202);
    const body = response.json();
    expect(body.message).toMatchObject({
      role: "user",
      content: "Build me a dashboard",
      agentRunId: body.run.id
    });
    expect(body.run).toMatchObject({
      projectId: project.id,
      status: "running",
      prompt: "Build me a dashboard"
    });

    const db = openDatabase(path.join(config.storageDir, "app.sqlite"));
    const run = await waitFor(() => {
      const row = db.prepare("select * from agent_runs where id = ?").get(body.run.id) as any;
      return row?.status === "succeeded" ? row : undefined;
    });
    expect(run.exit_code).toBe(0);
    expect(run.error_message).toBeNull();

    const logs = db.prepare("select * from agent_logs where agent_run_id = ? order by sequence").all(body.run.id);
    expect(logs.length).toBeGreaterThan(0);
    db.close();

    const list = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/messages`
    });

    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual([
      expect.objectContaining({
        role: "user",
        content: "Build me a dashboard",
        agentRunId: body.run.id
      })
    ]);

    await app.close();
  });

  it("rejects a new message while an agent run is active", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-messages-"));
    const config = testConfig(tempDir);
    const app = await createServer(config);

    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Busy App" }
    });
    const project = projectResponse.json();

    const db = openDatabase(path.join(config.storageDir, "app.sqlite"));
    const conversation = db
      .prepare("select id from conversations where project_id = ?")
      .get(project.id) as { id: string };
    db.prepare(`
      insert into agent_runs (
        id, project_id, conversation_id, status, prompt, command, created_at
      ) values (
        'active-run', ?, ?, 'queued', 'existing prompt', 'fake', ?
      )
    `).run(project.id, conversation.id, new Date().toISOString());
    db.close();

    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/messages`,
      payload: { content: "Build another thing" }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ message: "Agent run already active" });

    await app.close();
  });

  it.each([
    undefined,
    { content: "" },
    { content: "   " },
    { content: 42 }
  ])("rejects malformed content %#", async (payload) => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-messages-"));
    const config = testConfig(tempDir);
    const app = await createServer(config);
    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Validation App" }
    });
    const project = projectResponse.json();

    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/messages`,
      ...(payload === undefined ? {} : { payload })
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ message: "Message content is required" });

    await app.close();
  });

  it("returns 404 for missing projects on GET and POST", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-messages-"));
    const app = await createServer(testConfig(tempDir));

    const getResponse = await app.inject({
      method: "GET",
      url: "/api/projects/missing-project/messages"
    });
    const postResponse = await app.inject({
      method: "POST",
      url: "/api/projects/missing-project/messages",
      payload: { content: "Build something" }
    });

    expect(getResponse.statusCode).toBe(404);
    expect(getResponse.json()).toEqual({ message: "Project not found" });
    expect(postResponse.statusCode).toBe(404);
    expect(postResponse.json()).toEqual({ message: "Project not found" });

    await app.close();
  });

  it("returns generic 500 responses for unexpected list and create errors", async () => {
    const app = Fastify({ logger: false });
    await registerMessageRoutes(
      app,
      {
        getWorkspacePath: () => "workspace"
      } as unknown as ProjectService,
      {
        listMessages: () => {
          throw new Error("raw internal sqlite path");
        },
        createUserMessageWithRun: () => {
          throw new Error("raw internal token");
        }
      } as unknown as ConversationService,
      createAgentRunner(testConfig(path.resolve("/tmp")), new EventBus()),
      new EventBus()
    );

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/projects/project-1/messages"
    });
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/projects/project-1/messages",
      payload: { content: "Build something" }
    });

    expect(listResponse.statusCode).toBe(500);
    expect(listResponse.json()).toEqual({ message: "Message listing failed" });
    expect(listResponse.body).not.toContain("sqlite");
    expect(createResponse.statusCode).toBe(500);
    expect(createResponse.json()).toEqual({ message: "Message creation failed" });
    expect(createResponse.body).not.toContain("token");

    await app.close();
  });
});

function testConfig(root: string): AppConfig {
  return loadConfig({
    APP_ROOT: path.resolve(process.cwd()),
    STORAGE_DIR: path.join(root, "storage"),
    WORKSPACE_DIR: path.join(root, "workspaces"),
    TEMPLATE_DIR: path.resolve(process.cwd(), "templates/react-vite"),
    AGENT_PROVIDER: "fake"
  });
}

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
