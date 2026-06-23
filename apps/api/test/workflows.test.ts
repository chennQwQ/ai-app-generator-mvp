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

describe("workflow routes", () => {
  it("creates a workflow for a project", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-workflows-"));
    const config = loadConfig({
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces"),
      TEMPLATES_DIR: path.resolve(process.cwd(), "templates")
    });
    const app = await createServer(config);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Workflow Project" }
    });
    const project = createRes.json();

    const workflowRes = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/workflows`,
      payload: { name: "My First Workflow" }
    });
    expect(workflowRes.statusCode).toBe(201);
    const workflow = workflowRes.json();
    expect(workflow.name).toBe("My First Workflow");
    expect(workflow.projectId).toBe(project.id);
    expect(workflow.graph.nodes).toEqual([]);
    expect(workflow.graph.edges).toEqual([]);

    await app.close();
  });

  it("lists workflows for a project", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-workflows-"));
    const config = loadConfig({
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces"),
      TEMPLATES_DIR: path.resolve(process.cwd(), "templates")
    });
    const app = await createServer(config);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Workflow Project" }
    });
    const project = createRes.json();

    await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/workflows`,
      payload: { name: "WF 1" }
    });
    await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/workflows`,
      payload: { name: "WF 2" }
    });

    const listRes = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/workflows`
    });
    expect(listRes.statusCode).toBe(200);
    const workflows = listRes.json();
    expect(workflows).toHaveLength(2);

    await app.close();
  });

  it("gets a single workflow with graph", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-workflows-"));
    const config = loadConfig({
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces"),
      TEMPLATES_DIR: path.resolve(process.cwd(), "templates")
    });
    const app = await createServer(config);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Workflow Project" }
    });
    const project = createRes.json();

    const wfRes = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/workflows`,
      payload: { name: "WF" }
    });
    const workflow = wfRes.json();

    const getRes = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/workflows/${workflow.id}`
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().id).toBe(workflow.id);

    await app.close();
  });

  it("updates a workflow graph", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-workflows-"));
    const config = loadConfig({
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces"),
      TEMPLATES_DIR: path.resolve(process.cwd(), "templates")
    });
    const app = await createServer(config);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Workflow Project" }
    });
    const project = createRes.json();

    const wfRes = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/workflows`,
      payload: { name: "WF" }
    });
    const workflow = wfRes.json();

    const graph = {
      nodes: [
        { id: "1", type: "user_input", position: { x: 0, y: 0 }, data: { prompt: "hello" } },
        { id: "2", type: "agent_generation", position: { x: 200, y: 0 }, data: {} }
      ],
      edges: [
        { id: "e1", source: "1", target: "2" }
      ]
    };

    const updateRes = await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/workflows/${workflow.id}`,
      payload: { graph }
    });
    expect(updateRes.statusCode).toBe(200);
    const updated = updateRes.json();
    expect(updated.graph.nodes).toHaveLength(2);
    expect(updated.graph.edges).toHaveLength(1);

    await app.close();
  });

  it("deletes a workflow", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-workflows-"));
    const config = loadConfig({
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces"),
      TEMPLATES_DIR: path.resolve(process.cwd(), "templates")
    });
    const app = await createServer(config);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Workflow Project" }
    });
    const project = createRes.json();

    const wfRes = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/workflows`,
      payload: { name: "WF" }
    });
    const workflow = wfRes.json();

    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/projects/${project.id}/workflows/${workflow.id}`
    });
    expect(delRes.statusCode).toBe(200);

    const listRes = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/workflows`
    });
    expect(listRes.json()).toHaveLength(0);

    await app.close();
  });

  it("rejects duplicate workflow name in same project", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-workflows-"));
    const config = loadConfig({
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces"),
      TEMPLATES_DIR: path.resolve(process.cwd(), "templates")
    });
    const app = await createServer(config);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Workflow Project" }
    });
    const project = createRes.json();

    await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/workflows`,
      payload: { name: "WF" }
    });

    const dupRes = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/workflows`,
      payload: { name: "WF" }
    });
    expect(dupRes.statusCode).toBe(409);

    await app.close();
  });

  it("rejects invalid graph edges", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-workflows-"));
    const config = loadConfig({
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces"),
      TEMPLATES_DIR: path.resolve(process.cwd(), "templates")
    });
    const app = await createServer(config);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Workflow Project" }
    });
    const project = createRes.json();

    const wfRes = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/workflows`,
      payload: { name: "WF" }
    });
    const workflow = wfRes.json();

    const graph = {
      nodes: [
        { id: "1", type: "shell_command", position: { x: 0, y: 0 }, data: {} }
      ],
      edges: [
        { id: "e1", source: "nonexistent", target: "1" }
      ]
    };

    const updateRes = await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/workflows/${workflow.id}`,
      payload: { graph }
    });
    expect(updateRes.statusCode).toBe(400);

    await app.close();
  });

  it("rejects empty workflow name", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-workflows-"));
    const config = loadConfig({
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces"),
      TEMPLATES_DIR: path.resolve(process.cwd(), "templates")
    });
    const app = await createServer(config);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Workflow Project" }
    });
    const project = createRes.json();

    const res = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/workflows`,
      payload: { name: "  " }
    });
    expect(res.statusCode).toBe(400);

    await app.close();
  });

  it("returns 404 for missing workflow", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-workflows-"));
    const config = loadConfig({
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces"),
      TEMPLATES_DIR: path.resolve(process.cwd(), "templates")
    });
    const app = await createServer(config);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Workflow Project" }
    });
    const project = createRes.json();

    const res = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/workflows/missing`
    });
    expect(res.statusCode).toBe(404);

    await app.close();
  });

  it("exports an ApiFlow-compatible workflow", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-workflows-"));
    const config = loadConfig({
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces"),
      TEMPLATES_DIR: path.resolve(process.cwd(), "templates"),
      WORKFLOW_RUNTIME: "apiflow"
    });
    const app = await createServer(config);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "ApiFlow Project" }
    });
    const project = createRes.json();

    const wfRes = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/workflows`,
      payload: { name: "ApiFlow WF" }
    });
    const workflow = wfRes.json();

    const graph = {
      nodes: [
        { id: "input", type: "user_input", position: { x: 0, y: 0 }, data: { prompt: "hello" } },
        { id: "http", type: "http_request", position: { x: 200, y: 0 }, data: { url: "https://example.test", method: "GET" } }
      ],
      edges: [
        { id: "e1", source: "input", target: "http" }
      ]
    };

    await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/workflows/${workflow.id}`,
      payload: { graph }
    });

    const exportRes = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/workflows/${workflow.id}/export`
    });

    expect(exportRes.statusCode).toBe(200);
    const exported = exportRes.json();
    expect(exported.dsl).toContain("HTTP");
    expect(exported.entryNodeIds).toEqual(["input"]);
    expect(exported.unsupportedNodes).toEqual([]);

    await app.close();
  });

  it("rejects unsupported nodes during ApiFlow export", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-workflows-"));
    const config = loadConfig({
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces"),
      TEMPLATES_DIR: path.resolve(process.cwd(), "templates"),
      WORKFLOW_RUNTIME: "apiflow"
    });
    const app = await createServer(config);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "ApiFlow Project" }
    });
    const project = createRes.json();

    const wfRes = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/workflows`,
      payload: { name: "ApiFlow WF" }
    });
    const workflow = wfRes.json();

    const graph = {
      nodes: [
        { id: "agent", type: "agent_generation", position: { x: 0, y: 0 }, data: {} }
      ],
      edges: []
    };

    await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/workflows/${workflow.id}`,
      payload: { graph }
    });

    const exportRes = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/workflows/${workflow.id}/export`
    });

    expect(exportRes.statusCode).toBe(400);
    expect(exportRes.json().unsupportedNodes).toEqual(["agent"]);

    await app.close();
  });

  it("rejects empty workflow graphs during ApiFlow export", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-workflows-"));
    const config = loadConfig({
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces"),
      TEMPLATES_DIR: path.resolve(process.cwd(), "templates"),
      WORKFLOW_RUNTIME: "apiflow"
    });
    const app = await createServer(config);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "ApiFlow Project" }
    });
    const project = createRes.json();

    const wfRes = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/workflows`,
      payload: { name: "ApiFlow WF" }
    });
    const workflow = wfRes.json();

    const exportRes = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/workflows/${workflow.id}/export`
    });

    expect(exportRes.statusCode).toBe(400);
    expect(exportRes.json().errors).toContain("Workflow graph has no nodes");

    await app.close();
  });

  it("does not export workflows across project boundaries", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-workflows-"));
    const config = loadConfig({
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces"),
      TEMPLATES_DIR: path.resolve(process.cwd(), "templates"),
      WORKFLOW_RUNTIME: "apiflow"
    });
    const app = await createServer(config);

    const projectARes = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "ApiFlow Project A" }
    });
    const projectA = projectARes.json();

    const projectBRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "ApiFlow Project B" }
    });
    const projectB = projectBRes.json();

    const wfRes = await app.inject({
      method: "POST",
      url: `/api/projects/${projectA.id}/workflows`,
      payload: { name: "ApiFlow WF" }
    });
    const workflow = wfRes.json();

    const exportRes = await app.inject({
      method: "POST",
      url: `/api/projects/${projectB.id}/workflows/${workflow.id}/export`
    });

    expect(exportRes.statusCode).toBe(404);

    await app.close();
  });

  it("runs workflows through ApiFlow runtime and persists the external run id", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-workflows-"));
    const config = loadConfig({
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces"),
      TEMPLATES_DIR: path.resolve(process.cwd(), "templates"),
      WORKFLOW_RUNTIME: "apiflow"
    });
    const app = await createServer(config);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "ApiFlow Project" }
    });
    const project = createRes.json();

    const wfRes = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/workflows`,
      payload: { name: "ApiFlow WF" }
    });
    const workflow = wfRes.json();

    const graph = {
      nodes: [
        { id: "input", type: "user_input", position: { x: 0, y: 0 }, data: { prompt: "hello" } }
      ],
      edges: []
    };

    await app.inject({
      method: "PUT",
      url: `/api/projects/${project.id}/workflows/${workflow.id}`,
      payload: { graph }
    });

    const runRes = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/workflows/${workflow.id}/run`
    });

    expect(runRes.statusCode).toBe(202);
    const run = runRes.json();
    expect(run.workflowId).toBe(workflow.id);
    expect(run.projectId).toBe(project.id);
    expect(run.runtime).toBe("apiflow");
    expect(run.externalRunId).toMatch(/^apiflow-fake-/);
    expect(run.status).toBe("queued");

    await app.close();
  });
});
