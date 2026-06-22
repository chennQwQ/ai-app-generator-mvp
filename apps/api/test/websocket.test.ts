import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { loadConfig } from "../src/config.js";
import { createServer } from "../src/server.js";
import type { AppConfig } from "../src/config.js";
import type { ProjectEvent } from "@ai-app-generator/shared";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe("websocket route", () => {
  it("streams run status events for the subscribed project", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-websocket-"));
    const app = await createServer(testConfig(tempDir));
    await app.listen({ port: 0, host: "127.0.0.1" });

    try {
      const project = await createProject(app, "Realtime App");
      const socket = await openWebSocket(app, `/ws?projectId=${project.id}`);

      try {
        const message = waitForJsonMessage(socket);
        const response = await app.inject({
          method: "POST",
          url: `/api/projects/${project.id}/messages`,
          payload: { content: "Build a realtime app" }
        });

        expect(response.statusCode).toBe(202);
        await expect(message).resolves.toMatchObject({
          type: "run.status",
          projectId: project.id,
          run: {
            projectId: project.id,
            status: "running",
            prompt: "Build a realtime app"
          }
        });
      } finally {
        socket.close();
      }
    } finally {
      await app.close();
    }
  });

  it("does not stream events for other projects", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-websocket-"));
    const app = await createServer(testConfig(tempDir));
    await app.listen({ port: 0, host: "127.0.0.1" });

    try {
      const project1 = await createProject(app, "Subscribed App");
      const project2 = await createProject(app, "Other App");
      const socket = await openWebSocket(app, `/ws?projectId=${project1.id}`);

      try {
        const firstMessage = waitForJsonMessage(socket);
        const otherProjectResponse = await app.inject({
          method: "POST",
          url: `/api/projects/${project2.id}/messages`,
          payload: { content: "Build the other app" }
        });

        expect(otherProjectResponse.statusCode).toBe(202);
        await expect(settleWithin(firstMessage, 100)).resolves.toEqual({ settled: false });

        const subscribedProjectResponse = await app.inject({
          method: "POST",
          url: `/api/projects/${project1.id}/messages`,
          payload: { content: "Build the subscribed app" }
        });

        expect(subscribedProjectResponse.statusCode).toBe(202);
        await expect(firstMessage).resolves.toMatchObject({
          type: "run.status",
          projectId: project1.id
        });
      } finally {
        socket.close();
      }
    } finally {
      await app.close();
    }
  });

  it("closes connections that omit projectId", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-websocket-"));
    const app = await createServer(testConfig(tempDir));
    await app.listen({ port: 0, host: "127.0.0.1" });

    try {
      const socket = createWebSocket(app, "/ws");
      const close = waitForClose(socket);

      try {
        await waitForOpen(socket);
        await expect(close).resolves.toMatchObject({
          code: 1008,
          reason: "projectId is required"
        });
      } finally {
        socket.close();
      }
    } finally {
      await app.close();
    }
  });

  it("unsubscribes closed sockets before later events are published", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-websocket-"));
    const app = await createServer(testConfig(tempDir));
    await app.listen({ port: 0, host: "127.0.0.1" });

    try {
      const project = await createProject(app, "Closed Socket App");
      const socket = await openWebSocket(app, `/ws?projectId=${project.id}`);
      const close = waitForClose(socket);

      socket.close();
      await close;

      const response = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/messages`,
        payload: { content: "Build after close" }
      });

      expect(response.statusCode).toBe(202);
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
    TEMPLATE_DIR: path.resolve(process.cwd(), "templates/react-vite"),
    AGENT_PROVIDER: "fake"
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

async function waitForJsonMessage(socket: WebSocket): Promise<ProjectEvent> {
  const message = await new Promise<string>((resolve, reject) => {
    socket.once("message", (data) => {
      resolve(data.toString());
    });
    socket.once("error", () => reject(new Error("WebSocket error")));
  });

  return JSON.parse(message) as ProjectEvent;
}

async function waitForClose(socket: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    socket.once("close", (code, reason) =>
      resolve({ code, reason: reason.toString() })
    );
  });
}

async function settleWithin<T>(
  promise: Promise<T>,
  ms: number
): Promise<{ settled: false } | { settled: true; value: T }> {
  return Promise.race([
    promise.then((value) => ({ settled: true as const, value })),
    new Promise<{ settled: false }>((resolve) =>
      setTimeout(() => resolve({ settled: false }), ms)
    )
  ]);
}
