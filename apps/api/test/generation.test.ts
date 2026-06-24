import { mkdtempSync, rmSync } from "node:fs";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
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

describe("generation routes", () => {
  it("turns a user prompt into a persisted workflow graph, ApiFlow DSL, and node map", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-generation-"));
    const config = loadConfig({
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces"),
      TEMPLATES_DIR: path.resolve(process.cwd(), "templates")
    });
    const app = await createServer(config);

    try {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/projects",
        payload: { name: "Generated Workflow Project" }
      });
      const project = createRes.json();

      const response = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/generation/workflows`,
        payload: {
          prompt: "Create a library management system",
          conversationId: "conversation-1",
          apiBaseUrl: "http://127.0.0.1:4317"
        }
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.route).toBe("create_app_from_prompt");
      expect(body.workflow.projectId).toBe(project.id);
      expect(body.workflow.name).toContain("Create a library management system");
      expect(body.workflow.graph).toEqual({
        nodes: [
          {
            id: "node_parse_request",
            type: "user_input",
            position: { x: 0, y: 0 },
            data: { prompt: "Create a library management system" }
          },
          {
            id: "node_run_opencode",
            type: "agent_generation",
            position: { x: 260, y: 0 },
            data: {
              provider: "opencode",
              prompt: "Create a library management system"
            }
          }
        ],
        edges: [
          {
            id: "edge_parse_request_run_opencode",
            source: "node_parse_request",
            target: "node_run_opencode"
          }
        ]
      });
      expect(body.nodeMap).toEqual({
        task_parse_request: "node_parse_request",
        task_run_opencode: "node_run_opencode"
      });
      expect(body.input).toMatchObject({
        projectId: project.id,
        workflowRunId: null,
        conversationId: "conversation-1",
        prompt: "Create a library management system",
        apiBaseUrl: "http://127.0.0.1:4317"
      });
      expect(body.dsl).toContain("task_parse_request = EVAL");
      expect(body.dsl).toContain("task_run_opencode = HTTP");
      expect(body.dsl).toContain('url = input.apiBaseUrl + "/internal/agent-runs"');
      expect(body.dsl).toContain('nodeId: "node_run_opencode"');
      expect(body.dsl).toContain("run task_parse_request");
      expect(body.dsl).toContain("run task_run_opencode");

      const getRes = await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/workflows/${body.workflow.id}`
      });
      expect(getRes.statusCode).toBe(200);
      expect(getRes.json().graph).toEqual(body.workflow.graph);
    } finally {
      await app.close();
    }
  });


  it("starts generated DSL through the ApiFlow sidecar when requested", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-generation-"));
    const sidecar = await startSidecarStub();
    const config = loadConfig({
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces"),
      TEMPLATES_DIR: path.resolve(process.cwd(), "templates"),
      WORKFLOW_RUNTIME: "apiflow-http",
      APIFLOW_SIDECAR_URL: sidecar.url
    });
    const app = await createServer(config);

    try {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/projects",
        payload: { name: "Generated Runtime Project" }
      });
      const project = createRes.json();

      const response = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/generation/workflows`,
        payload: {
          prompt: "Create a library management system",
          conversationId: "conversation-1",
          apiBaseUrl: "http://127.0.0.1:4317",
          run: true
        }
      });

      expect(response.statusCode).toBe(202);
      const body = response.json();
      expect(body.run).toMatchObject({
        workflowId: body.workflow.id,
        projectId: project.id,
        runtime: "apiflow",
        externalRunId: "apiflow-test-run-1",
        status: "queued"
      });
      expect(sidecar.requests).toHaveLength(1);
      const sidecarRequest = sidecar.requests[0];
      if (!sidecarRequest) throw new Error("Expected sidecar request");
      expect(sidecarRequest.method).toBe("POST");
      expect(sidecarRequest.url).toBe(`/api/apiflow/workflows/${body.workflow.id}/runs`);
      expect(sidecarRequest.body).toMatchObject({
        workflowId: body.workflow.id,
        workflowName: body.workflow.name
      });
      expect(sidecarRequest.body.dsl).toContain("task_run_opencode = HTTP");
      expect(sidecarRequest.body.input).toMatchObject({
        projectId: project.id,
        workflowRunId: body.run.id,
        conversationId: "conversation-1",
        prompt: "Create a library management system",
        apiBaseUrl: "http://127.0.0.1:4317"
      });
    } finally {
      await app.close();
      await sidecar.close();
    }
  });
  it("rejects empty generation prompts", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-generation-"));
    const app = await createServer(loadConfig({
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces"),
      TEMPLATES_DIR: path.resolve(process.cwd(), "templates")
    }));

    try {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/projects",
        payload: { name: "Generated Workflow Project" }
      });
      const project = createRes.json();

      const response = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/generation/workflows`,
        payload: { prompt: "   " }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ message: "Generation prompt is required" });
    } finally {
      await app.close();
    }
  });
});
async function startSidecarStub(): Promise<{
  url: string;
  requests: Array<{ method: string; url: string; body: any }>;
  close: () => Promise<void>;
}> {
  const requests: Array<{ method: string; url: string; body: any }> = [];
  const server = createHttpServer(async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method === "POST" && request.url?.startsWith("/api/apiflow/workflows/")) {
      const body = await readJsonBody(request);
      requests.push({ method: request.method, url: request.url, body });
      response.writeHead(202, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        externalRunId: "apiflow-test-run-1",
        workflowId: body.workflowId,
        status: "queued",
        result: null,
        error: null,
        startedAt: null,
        finishedAt: null,
        createdAt: new Date().toISOString()
      }));
      return;
    }

    if (request.method === "GET" && request.url === "/api/apiflow/runs/apiflow-test-run-1") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        externalRunId: "apiflow-test-run-1",
        workflowId: requests[0]?.body.workflowId ?? "unknown",
        status: "queued",
        result: null,
        error: null,
        startedAt: null,
        finishedAt: null,
        createdAt: new Date().toISOString()
      }));
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ message: "not found" }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Failed to start sidecar stub");

  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

async function readJsonBody(request: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : null;
}
