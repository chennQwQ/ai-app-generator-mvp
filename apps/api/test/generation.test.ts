import { mkdtempSync, rmSync } from "node:fs";
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