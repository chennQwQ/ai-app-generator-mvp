import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, type AppConfig } from "../src/config.js";
import { openDatabase } from "../src/db/database.js";
import { EventBus } from "../src/events/event-bus.js";
import { ProjectService, ProjectNotFoundError } from "../src/projects/project-service.js";
import { TemplateService } from "../src/templates/template-service.js";
import { registerMessageRoutes } from "../src/routes/messages.js";
import { createAgentRunner, type AgentRunner } from "../src/agent/agent-runner.js";
import { ConversationService } from "../src/conversations/conversation-service.js";
import { createServer } from "../src/server.js";
import type { AgentLog, AgentRun } from "@ai-app-generator/shared";

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

  it("publishes the same persisted log records that are stored in the database", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-messages-"));
    const config = testConfig(tempDir);
    const app = Fastify({ logger: false });
    const db = openDatabase(path.join(config.storageDir, "app.sqlite"));
    const projects = new ProjectService(db, config, new TemplateService(config.templatesDir));
    const conversations = new ConversationService(db);
    const bus = new EventBus();
    const runner = createAgentRunner(config, bus);
    await registerMessageRoutes(app, projects, conversations, runner, bus);
    const project = projects.createProject("Logged App");
    const publishedLogs: AgentLog[] = [];
    bus.subscribe(project.id, (event) => {
      if (event.type === "run.log") publishedLogs.push(event.log);
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/messages`,
      payload: { content: "Build me a logged dashboard" }
    });

    expect(response.statusCode).toBe(202);
    const body = response.json();
    await waitFor(() => {
      const row = db.prepare("select * from agent_runs where id = ?").get(body.run.id) as any;
      return row?.status === "succeeded" ? row : undefined;
    });
    const storedLogs = db
      .prepare("select * from agent_logs where agent_run_id = ? order by sequence")
      .all(body.run.id) as any[];

    expect(publishedLogs).toHaveLength(storedLogs.length);
    expect(publishedLogs).toEqual(
      storedLogs.map((log) => ({
        id: log.id,
        agentRunId: log.agent_run_id,
        stream: log.stream,
        content: log.content,
        sequence: log.sequence,
        createdAt: log.created_at
      }))
    );

    db.close();
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

  it("returns generic 500 responses when a project exists but its conversation is missing", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-messages-"));
    const config = testConfig(tempDir);
    const app = await createServer(config);

    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Broken Conversation App" }
    });
    const project = projectResponse.json();
    const db = openDatabase(path.join(config.storageDir, "app.sqlite"));
    db.prepare("delete from conversations where project_id = ?").run(project.id);
    db.close();

    const getResponse = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/messages`
    });
    const postResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/messages`,
      payload: { content: "Build something" }
    });

    expect(getResponse.statusCode).toBe(500);
    expect(getResponse.json()).toEqual({ message: "Message listing failed" });
    expect(postResponse.statusCode).toBe(500);
    expect(postResponse.json()).toEqual({ message: "Message creation failed" });

    await app.close();
  });

  it("does not leak unhandled rejections when background failure reporting throws", async () => {
    const app = Fastify({ logger: false });
    const bus = new EventBus();
    const run = agentRun("run-1", "project-1", "conversation-1", "queued");
    let statusUpdates = 0;
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);

    try {
      await registerMessageRoutes(
        app,
        {
          getWorkspacePath: () => "workspace"
        } as unknown as ProjectService,
        {
          createUserMessageWithRun: () => ({
            message: {
              id: "message-1",
              conversationId: "conversation-1",
              role: "user",
              content: "Build something",
              agentRunId: run.id,
              createdAt: new Date().toISOString()
            },
            run
          }),
          updateAgentRunStatus: (_runId: string, status: AgentRun["status"]) => {
            statusUpdates += 1;
            if (statusUpdates === 1) return { ...run, status };
            throw new Error("status update failed");
          },
          recordAgentLog: () => {
            throw new Error("unexpected log");
          }
        } as unknown as ConversationService,
        {
          command: "test-runner",
          run: async () => {
            throw new Error("runner failed");
          },
          cancel: () => {},
          healthCheck: async () => ({ ok: true })
        } satisfies AgentRunner,
        bus
      );

      const response = await app.inject({
        method: "POST",
        url: "/api/projects/project-1/messages",
        payload: { content: "Build something" }
      });

      expect(response.statusCode).toBe(202);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
      await app.close();
    }
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

function agentRun(
  id: string,
  projectId: string,
  conversationId: string,
  status: AgentRun["status"]
): AgentRun {
  return {
    id,
    projectId,
    conversationId,
    status,
    prompt: "Build something",
    command: "test-runner",
    exitCode: null,
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
    createdAt: new Date().toISOString()
  };
}

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
