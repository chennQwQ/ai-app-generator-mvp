import type { FastifyInstance } from "fastify";
import type { WorkflowGraph } from "@ai-app-generator/shared";
import { apiFlowCompatibleNodeTypes } from "@ai-app-generator/shared";
import {
  DuplicateWorkflowNameError,
  InvalidWorkflowGraphError,
  WorkflowNotFoundError,
  type WorkflowService
} from "../workflows/workflow-service.js";
import { WorkflowRunActiveError, type WorkflowExecutor } from "../workflows/workflow-executor.js";
import type { ApiFlowRuntimeAdapter } from "../apiflow/apiflow-adapter.js";

export async function registerWorkflowRoutes(
  app: FastifyInstance,
  workflows: WorkflowService,
  executor?: WorkflowExecutor,
  apiFlowAdapter?: ApiFlowRuntimeAdapter
) {
  app.get("/api/projects/:projectId/workflows", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    try {
      return workflows.listWorkflows(projectId);
    } catch (error) {
      request.log.error({ err: error }, "Workflow listing failed");
      return reply.code(500).send({ message: "Workflow listing failed" });
    }
  });

  app.post("/api/projects/:projectId/workflows", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = request.body;
    const name =
      body && typeof body === "object" && "name" in body && typeof body.name === "string"
        ? body.name.trim()
        : "";
    if (!name) return reply.code(400).send({ message: "Workflow name is required" });

    try {
      const workflow = workflows.createWorkflow(projectId, name);
      return reply.code(201).send(workflow);
    } catch (error) {
      if (error instanceof DuplicateWorkflowNameError) {
        return reply.code(409).send({ message: error.message });
      }
      request.log.error({ err: error }, "Workflow creation failed");
      return reply.code(500).send({ message: "Workflow creation failed" });
    }
  });

  app.get("/api/projects/:projectId/workflows/:workflowId", async (request, reply) => {
    const { projectId, workflowId } = request.params as { projectId: string; workflowId: string };
    try {
      return workflows.getWorkflowForProject(projectId, workflowId);
    } catch (error) {
      if (error instanceof WorkflowNotFoundError) {
        return reply.code(404).send({ message: "Workflow not found" });
      }
      request.log.error({ err: error }, "Workflow lookup failed");
      return reply.code(500).send({ message: "Workflow lookup failed" });
    }
  });

  app.put("/api/projects/:projectId/workflows/:workflowId", async (request, reply) => {
    const { workflowId } = request.params as { workflowId: string };
    const body = request.body;
    const graph =
      body && typeof body === "object" && "graph" in body && typeof body.graph === "object"
        ? (body.graph as WorkflowGraph)
        : null;
    if (!graph) return reply.code(400).send({ message: "Workflow graph is required" });

    try {
      const workflow = workflows.updateGraph(workflowId, graph);
      return workflow;
    } catch (error) {
      if (error instanceof WorkflowNotFoundError) {
        return reply.code(404).send({ message: "Workflow not found" });
      }
      if (error instanceof InvalidWorkflowGraphError) {
        return reply.code(400).send({ message: error.message });
      }
      request.log.error({ err: error }, "Workflow update failed");
      return reply.code(500).send({ message: "Workflow update failed" });
    }
  });

  app.delete("/api/projects/:projectId/workflows/:workflowId", async (request, reply) => {
    const { workflowId } = request.params as { workflowId: string };
    try {
      workflows.deleteWorkflow(workflowId);
      return { ok: true };
    } catch (error) {
      if (error instanceof WorkflowNotFoundError) {
        return reply.code(404).send({ message: "Workflow not found" });
      }
      request.log.error({ err: error }, "Workflow deletion failed");
      return reply.code(500).send({ message: "Workflow deletion failed" });
    }
  });

  app.post("/api/projects/:projectId/workflows/:workflowId/run", async (request, reply) => {
    const { workflowId } = request.params as { workflowId: string };
    if (!executor) {
      return reply.code(500).send({ message: "Workflow executor not configured" });
    }
    try {
      const run = await executor.execute(workflowId);
      return reply.code(202).send(run);
    } catch (error) {
      if (error instanceof WorkflowNotFoundError) {
        return reply.code(404).send({ message: "Workflow not found" });
      }
      if (error instanceof WorkflowRunActiveError) {
        return reply.code(409).send({ message: error.message });
      }
      request.log.error({ err: error }, "Workflow execution failed");
      return reply.code(500).send({ message: "Workflow execution failed" });
    }
  });

  app.post("/api/projects/:projectId/workflows/:workflowId/export", async (request, reply) => {
    const { workflowId } = request.params as { workflowId: string };
    if (!apiFlowAdapter) {
      return reply.code(500).send({ message: "ApiFlow adapter not configured" });
    }
    try {
      const workflow = workflows.getWorkflow(workflowId);
      const result = await apiFlowAdapter.exportWorkflow({
        projectId: workflow.projectId,
        workflowId: workflow.id,
        workflowName: workflow.name,
        graph: workflow.graph
      });
      return result;
    } catch (error) {
      if (error instanceof WorkflowNotFoundError) {
        return reply.code(404).send({ message: "Workflow not found" });
      }
      request.log.error({ err: error }, "Workflow export failed");
      return reply.code(500).send({ message: "Workflow export failed" });
    }
  });
}
