import type { FastifyInstance } from "fastify";
import { ProjectNotFoundError, type ProjectService } from "../projects/project-service.js";
import {
  DuplicateWorkflowNameError,
  InvalidWorkflowGraphError,
  type WorkflowService
} from "../workflows/workflow-service.js";
import { GenerationRouter, GenerationRoutingError } from "../generation/generation-router.js";
import { UnsupportedGenerationRouteError, WorkflowFactory } from "../generation/workflow-factory.js";

export async function registerGenerationRoutes(
  app: FastifyInstance,
  projects: ProjectService,
  workflows: WorkflowService,
  router = new GenerationRouter(),
  factory = new WorkflowFactory()
) {
  app.post("/api/projects/:projectId/generation/workflows", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = request.body;
    const prompt = parsePrompt(body);
    if (!prompt) return reply.code(400).send({ message: "Generation prompt is required" });

    const conversationId = parseOptionalString(body, "conversationId");
    const apiBaseUrl = parseOptionalString(body, "apiBaseUrl");

    try {
      projects.getWorkspacePath(projectId);
      const decision = router.route({ prompt });
      const generated = factory.create({ route: decision.route, prompt });
      const workflow = workflows.updateGraph(
        workflows.createWorkflow(projectId, generated.name).id,
        generated.graph
      );

      return reply.code(201).send({
        route: decision.route,
        reason: decision.reason,
        workflow,
        dsl: generated.dsl,
        nodeMap: generated.nodeMap,
        input: {
          projectId,
          workflowRunId: null,
          conversationId,
          prompt,
          apiBaseUrl: apiBaseUrl ?? "http://127.0.0.1:4317"
        }
      });
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        return reply.code(404).send({ message: "Project not found" });
      }
      if (error instanceof GenerationRoutingError) {
        return reply.code(400).send({ message: error.message });
      }
      if (error instanceof UnsupportedGenerationRouteError) {
        return reply.code(400).send({ message: error.message });
      }
      if (error instanceof DuplicateWorkflowNameError) {
        return reply.code(409).send({ message: error.message });
      }
      if (error instanceof InvalidWorkflowGraphError) {
        return reply.code(400).send({ message: error.message });
      }

      request.log.error({ err: error }, "Generation workflow creation failed");
      return reply.code(500).send({ message: "Generation workflow creation failed" });
    }
  });
}

function parsePrompt(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("prompt" in body)) return null;
  const prompt = body.prompt;
  if (typeof prompt !== "string") return null;
  const trimmed = prompt.trim();
  return trimmed ? trimmed : null;
}

function parseOptionalString(body: unknown, key: string): string | null {
  if (!body || typeof body !== "object" || !(key in body)) return null;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}