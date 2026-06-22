import type { FastifyInstance } from "fastify";
import { ProjectNotFoundError, type ProjectService } from "../projects/project-service.js";
import type { ConversationService } from "../conversations/conversation-service.js";

export async function registerRunRoutes(
  app: FastifyInstance,
  projects: ProjectService,
  conversations: ConversationService
) {
  app.get("/api/projects/:projectId/runs", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    try {
      projects.getWorkspacePath(projectId);
      return conversations.listAgentRuns(projectId);
    } catch (error) {
      if (isProjectNotFoundError(error)) {
        return reply.code(404).send({ message: "Project not found" });
      }

      request.log.error({ err: error }, "Run listing failed");
      return reply.code(500).send({ message: "Run listing failed" });
    }
  });

  app.get("/api/projects/:projectId/runs/:runId/logs", async (request, reply) => {
    const { projectId, runId } = request.params as { projectId: string; runId: string };

    try {
      projects.getWorkspacePath(projectId);
      conversations.getAgentRun(runId);
      return conversations.listAgentLogs(runId);
    } catch (error) {
      if (isProjectNotFoundError(error)) {
        return reply.code(404).send({ message: "Project not found" });
      }
      if (error instanceof Error && error.message.includes("Agent run not found")) {
        return reply.code(404).send({ message: "Agent run not found" });
      }

      request.log.error({ err: error }, "Agent log listing failed");
      return reply.code(500).send({ message: "Agent log listing failed" });
    }
  });
}

function isProjectNotFoundError(error: unknown): boolean {
  return error instanceof ProjectNotFoundError;
}
