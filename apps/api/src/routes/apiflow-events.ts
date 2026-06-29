import type { FastifyInstance } from "fastify";
import {
  ApiFlowEventService,
  InvalidApiFlowTaskEventError,
  WorkflowTaskMappingNotFoundError
} from "../apiflow/apiflow-event-service.js";

export async function registerApiFlowEventRoutes(
  app: FastifyInstance,
  events: ApiFlowEventService
) {
  app.post("/internal/apiflow-events", async (request, reply) => {
    const parsed = parseBody(request.body);
    if (!parsed) {
      return reply.code(400).send({ message: "workflowRunId, taskId, and status are required" });
    }

    try {
      const result = events.publishTaskEvent(parsed);
      return reply.code(202).send(result);
    } catch (error) {
      if (error instanceof InvalidApiFlowTaskEventError) {
        return reply.code(400).send({ message: error.message });
      }
      if (error instanceof WorkflowTaskMappingNotFoundError) {
        return reply.code(404).send({ message: "Workflow task mapping not found" });
      }

      request.log.error({ err: error }, "ApiFlow event handling failed");
      return reply.code(500).send({ message: "ApiFlow event handling failed" });
    }
  });
}

interface ParsedApiFlowEventBody {
  projectId: string | null;
  workflowRunId: string;
  taskId: string;
  status: string;
}

function parseBody(body: unknown): ParsedApiFlowEventBody | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const workflowRunId = parseRequiredString(record.workflowRunId);
  const taskId = parseRequiredString(record.taskId);
  const status = parseRequiredString(record.status);
  const projectId = parseOptionalString(record.projectId);

  if (!workflowRunId || !taskId || !status) return null;
  return { projectId, workflowRunId, taskId, status };
}

function parseRequiredString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
