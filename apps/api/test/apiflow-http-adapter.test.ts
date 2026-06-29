import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { HttpApiFlowRuntimeAdapter } from "../src/apiflow/apiflow-http-adapter.js";

let server: ReturnType<typeof createServer> | undefined;

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server?.close((error) => (error ? reject(error) : resolve()));
  });
  server = undefined;
});

describe("HttpApiFlowRuntimeAdapter", () => {
  it("checks sidecar health at /health", async () => {
    const requests: string[] = [];
    const baseUrl = await startServer((request, response) => {
      requests.push(request.url ?? "");
      if (request.url === "/health") {
        writeJson(response, 200, { ok: true });
        return;
      }
      writeJson(response, 404, { error: "not found" });
    });
    const adapter = new HttpApiFlowRuntimeAdapter({ baseUrl });

    await expect(adapter.healthCheck()).resolves.toEqual({ ok: true });
    expect(requests).toEqual(["/health"]);
  });

  it("fetches sidecar run events after the last seen sequence", async () => {
    const requests: string[] = [];
    const baseUrl = await startServer((request, response) => {
      requests.push(request.url ?? "");
      if (request.url === "/api/apiflow/runs/external-1/events?after=7") {
        writeJson(response, 200, [
          {
            sequence: 8,
            runId: "external-1",
            type: "task.running",
            nodeId: "node-parse-request",
            status: "running",
            message: "started",
            at: "2026-06-29T00:00:00.000Z",
            payload: { taskId: "task_parse_request" }
          }
        ]);
        return;
      }
      writeJson(response, 404, { error: "not found" });
    });
    const adapter = new HttpApiFlowRuntimeAdapter({ baseUrl });

    await expect(adapter.getEvents("external-1", 7)).resolves.toEqual([
      {
        sequence: 8,
        externalRunId: "external-1",
        type: "task.running",
        nodeId: "node-parse-request",
        taskId: "task_parse_request",
        status: "running",
        message: "started",
        at: "2026-06-29T00:00:00.000Z",
        payload: { taskId: "task_parse_request" }
      }
    ]);
    expect(requests).toEqual(["/api/apiflow/runs/external-1/events?after=7"]);
  });
});

async function startServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void
): Promise<string> {
  server = createServer(handler);
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server did not bind to a port");
  return `http://127.0.0.1:${address.port}`;
}

function writeJson(response: ServerResponse, statusCode: number, value: unknown): void {
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}
