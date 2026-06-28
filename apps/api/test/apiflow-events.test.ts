import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { afterEach, describe, expect, it } from "vitest";
import type { ProjectEvent } from "@ai-app-generator/shared";
import { loadConfig, type AppConfig } from "../src/config.js";
import { createServer } from "../src/server.js";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe("internal ApiFlow event routes", () => {
  it("maps ApiFlow task events to workflow node status events", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-apiflow-events-"));
    const app = await createServer(testConfig(tempDir));
    await app.listen({ port: 0, host: "127.0.0.1" });

    try {
      const project = await createProject(app, "Workflow Events App");
      const generationResponse = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/generation/workflows`,
        payload: {
          prompt: "Create a notes app",
          run: true
        }
      });
      expect(generationResponse.statusCode).toBe(202);
      const generation = generationResponse.json();

      const socket = await openWebSocket(app, `/ws?projectId=${project.id}`);
      try {
        const nodeStatus = waitForMatchingMessage(socket, (event) =>
          event.type === "workflow.node.status" &&
          event.nodeId === "node_parse_request" &&
          event.status === "running"
        );

        const response = await app.inject({
          method: "POST",
          url: "/internal/apiflow-events",
          payload: {
            projectId: project.id,
            workflowRunId: generation.run.id,
            taskId: "task_parse_request",
            status: "running"
          }
        });

        expect(response.statusCode).toBe(202);
        expect(response.json()).toEqual({
          projectId: project.id,
          workflowRunId: generation.run.id,
          taskId: "task_parse_request",
          nodeId: "node_parse_request",
          status: "running"
        });

        await expect(nodeStatus).resolves.toMatchObject({
          type: "workflow.node.status",
          projectId: project.id,
          nodeId: "node_parse_request",
          status: "running"
        });
      } finally {
        socket.close();
      }
    } finally {
      await app.close();
    }
  });

  it("returns 404 when an event cannot be mapped to a workflow node", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-apiflow-events-"));
    const app = await createServer(testConfig(tempDir));

    try {
      const response = await app.inject({
        method: "POST",
        url: "/internal/apiflow-events",
        payload: {
          workflowRunId: "missing-run",
          taskId: "task_parse_request",
          status: "running"
        }
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ message: "Workflow task mapping not found" });
    } finally {
      await app.close();
    }
  });
});

function testConfig(root: string): AppConfig {
  return loadConfig({
    APP_ROOT: path.resolve(process.cwd()),
    STORAGE_DIR: path.join(root, "storage"),
    WORKSPACE_DIR: path.join(root, "workspaces"),
    TEMPLATES_DIR: path.resolve(process.cwd(), "templates"),
    AGENT_PROVIDER: "fake",
    WORKFLOW_RUNTIME: "apiflow"
  });
}

async function createProject(app: Awaited<ReturnType<typeof createServer>>, name: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/projects",
    payload: { name }
  });

  expect(response.statusCode).toBe(201);
  return response.json() as { id: string };
}

async function openWebSocket(
  app: Awaited<ReturnType<typeof createServer>>,
  pathAndQuery: string
): Promise<WebSocket> {
  const socket = createWebSocket(app, pathAndQuery);
  await waitForOpen(socket);
  return socket;
}

function createWebSocket(
  app: Awaited<ReturnType<typeof createServer>>,
  pathAndQuery: string
): WebSocket {
  const address = app.server.address();
  if (!address || typeof address === "string") throw new Error("Server is not listening on a port");

  return new WebSocket(`ws://127.0.0.1:${address.port}${pathAndQuery}`);
}

async function waitForOpen(socket: WebSocket): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", () => reject(new Error("WebSocket failed to open")));
  });
}

async function waitForMatchingMessage(
  socket: WebSocket,
  matches: (event: ProjectEvent) => boolean
): Promise<ProjectEvent> {
  const deadline = Date.now() + 2_000;

  while (Date.now() < deadline) {
    const event = await waitForJsonMessage(socket);
    if (matches(event)) return event;
  }

  throw new Error("Timed out waiting for matching WebSocket event");
}

async function waitForJsonMessage(socket: WebSocket): Promise<ProjectEvent> {
  const message = await new Promise<string>((resolve, reject) => {
    socket.once("message", (data) => {
      resolve(data.toString());
    });
    socket.once("error", () => reject(new Error("WebSocket error")));
  });

  return JSON.parse(message) as ProjectEvent;
}
