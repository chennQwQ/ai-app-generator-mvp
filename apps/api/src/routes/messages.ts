import type { FastifyInstance } from "fastify";
import type { AgentRun } from "@ai-app-generator/shared";
import { ProjectNotFoundError, type ProjectService } from "../projects/project-service.js";
import {
  ActiveAgentRunError,
  ConversationNotFoundError,
  type ConversationService
} from "../conversations/conversation-service.js";
import type { AgentRunner } from "../agent/agent-runner.js";
import type { EventBus } from "../events/event-bus.js";

export async function registerMessageRoutes(
  app: FastifyInstance,
  projects: ProjectService,
  conversations: ConversationService,
  runner: AgentRunner,
  bus: EventBus
) {
  app.get("/api/projects/:projectId/messages", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    try {
      projects.getWorkspacePath(projectId);
      return conversations.listMessages(projectId);
    } catch (error) {
      if (isNotFoundError(error)) {
        return reply.code(404).send({ message: "Project not found" });
      }

      request.log.error({ err: error }, "Message listing failed");
      return reply.code(500).send({ message: "Message listing failed" });
    }
  });

  app.post("/api/projects/:projectId/messages", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const content = parseContent(request.body);
    if (!content) return reply.code(400).send({ message: "Message content is required" });

    let workspacePath: string;
    let created: { message: unknown; run: AgentRun };
    try {
      workspacePath = projects.getWorkspacePath(projectId);
      created = conversations.createUserMessageWithRun(projectId, content, runner.command);
      const runningRun = conversations.updateAgentRunStatus(created.run.id, "running");
      created = { message: created.message, run: runningRun };
    } catch (error) {
      if (isNotFoundError(error)) {
        return reply.code(404).send({ message: "Project not found" });
      }
      if (error instanceof ActiveAgentRunError) {
        return reply.code(409).send({ message: "Agent run already active" });
      }

      request.log.error({ err: error }, "Message creation failed");
      return reply.code(500).send({ message: "Message creation failed" });
    }

    bus.publish({ type: "run.status", projectId, run: created.run });
    startRun({
      app,
      projectId,
      workspacePath,
      prompt: content,
      run: created.run,
      conversations,
      runner,
      bus
    });

    return reply.code(202).send(created);
  });
}

function startRun(options: {
  app: FastifyInstance;
  projectId: string;
  workspacePath: string;
  prompt: string;
  run: AgentRun;
  conversations: ConversationService;
  runner: AgentRunner;
  bus: EventBus;
}): void {
  const unsubscribe = options.bus.subscribe(options.projectId, (event) => {
    if (event.type === "run.log" && event.log.agentRunId === options.run.id) {
      options.conversations.recordAgentLog(event.log.agentRunId, event.log.stream, event.log.content);
    }
  });

  void (async () => {
    try {
      const result = await options.runner.run({
        projectId: options.projectId,
        runId: options.run.id,
        workspacePath: options.workspacePath,
        prompt: options.prompt
      });
      const status = result.exitCode === 0 ? "succeeded" : "failed";
      const completedRun = options.conversations.updateAgentRunStatus(options.run.id, status, result);
      options.bus.publish({ type: "run.status", projectId: options.projectId, run: completedRun });
      if (status === "succeeded") {
        options.bus.publish({ type: "files.changed", projectId: options.projectId });
      }
    } catch (error) {
      options.app.log.error({ err: error }, "Agent run failed");
      const failedRun = options.conversations.updateAgentRunStatus(options.run.id, "failed", {
        exitCode: 1,
        errorMessage: "Agent run failed"
      });
      options.bus.publish({ type: "run.status", projectId: options.projectId, run: failedRun });
    } finally {
      unsubscribe();
    }
  })();
}

function parseContent(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("content" in body)) return null;
  const content = body.content;
  if (typeof content !== "string") return null;
  const trimmed = content.trim();
  return trimmed ? trimmed : null;
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof ProjectNotFoundError || error instanceof ConversationNotFoundError;
}
