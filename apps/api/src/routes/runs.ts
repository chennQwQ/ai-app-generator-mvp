import type { FastifyInstance } from "fastify";
import type { AgentRun } from "@ai-app-generator/shared";
import { ProjectNotFoundError, type ProjectService } from "../projects/project-service.js";
import type { ConversationService } from "../conversations/conversation-service.js";
import type { AgentRunner } from "../agent/agent-runner.js";
import type { EventBus } from "../events/event-bus.js";

export async function registerRunRoutes(
  app: FastifyInstance,
  projects: ProjectService,
  conversations: ConversationService,
  runner: AgentRunner,
  bus: EventBus
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

  app.post("/api/projects/:projectId/runs/:runId/cancel", async (request, reply) => {
    const { projectId, runId } = request.params as { projectId: string; runId: string };

    try {
      projects.getWorkspacePath(projectId);
      const run: AgentRun = conversations.getAgentRun(runId);

      if (run.status !== "queued" && run.status !== "running") {
        return reply.code(409).send({ message: "Run is not active" });
      }

      runner.cancel(runId);
      const cancelledRun = conversations.updateAgentRunStatus(runId, "cancelled", {
        exitCode: 1,
        errorMessage: "Cancelled by user"
      });
      bus.publish({ type: "run.status", projectId, run: cancelledRun });

      return reply.code(202).send({ run: cancelledRun });
    } catch (error) {
      if (isProjectNotFoundError(error)) {
        return reply.code(404).send({ message: "Project not found" });
      }
      if (error instanceof Error && error.message.includes("Agent run not found")) {
        return reply.code(404).send({ message: "Agent run not found" });
      }

      request.log.error({ err: error }, "Agent run cancel failed");
      return reply.code(500).send({ message: "Agent run cancel failed" });
    }
  });
}

function isProjectNotFoundError(error: unknown): boolean {
  return error instanceof ProjectNotFoundError;
}
