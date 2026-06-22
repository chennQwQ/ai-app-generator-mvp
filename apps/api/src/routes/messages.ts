import type { FastifyInstance } from "fastify";
import type { AgentLogStream, AgentRun } from "@ai-app-generator/shared";
import { ProjectNotFoundError, type ProjectService } from "../projects/project-service.js";
import {
  ActiveAgentRunError,
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
      if (isProjectNotFoundError(error)) {
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
      if (isProjectNotFoundError(error)) {
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
  void (async () => {
    try {
      const result = await options.runner.run({
        projectId: options.projectId,
        runId: options.run.id,
        workspacePath: options.workspacePath,
        prompt: options.prompt,
        onLog: (stream, content) => recordAndPublishLog(options, stream, content)
      });
      const status = result.exitCode === 0 ? "succeeded" : "failed";
      const completedRun = safeUpdateAgentRunStatus(options, status, result);
      if (completedRun) {
        safePublish(options, { type: "run.status", projectId: options.projectId, run: completedRun });
      }
      if (status === "succeeded") {
        safePublish(options, { type: "files.changed", projectId: options.projectId });
      }
    } catch (error) {
      safeLogError(options, error, "Agent run failed");
      const failedRun = safeUpdateAgentRunStatus(options, "failed", {
        exitCode: 1,
        errorMessage: "Agent run failed"
      });
      if (failedRun) {
        safePublish(options, { type: "run.status", projectId: options.projectId, run: failedRun });
      }
    }
  })().catch((error) => {
    safeLogError(options, error, "Background agent task failed");
  });
}

type StartRunOptions = Parameters<typeof startRun>[0];

function recordAndPublishLog(
  options: StartRunOptions,
  stream: AgentLogStream,
  content: string
): void {
  try {
    const log = options.conversations.recordAgentLog(options.run.id, stream, content);
    safePublish(options, { type: "run.log", projectId: options.projectId, log });
  } catch (error) {
    safeLogError(options, error, "Agent log recording failed");
  }
}

function safeUpdateAgentRunStatus(
  options: StartRunOptions,
  status: AgentRun["status"],
  fields: { exitCode?: number | null; errorMessage?: string | null } = {}
): AgentRun | null {
  try {
    return options.conversations.updateAgentRunStatus(options.run.id, status, fields);
  } catch (error) {
    safeLogError(options, error, "Agent run status update failed");
    return null;
  }
}

function safePublish(options: StartRunOptions, event: Parameters<EventBus["publish"]>[0]): void {
  try {
    options.bus.publish(event);
  } catch (error) {
    safeLogError(options, error, "Project event publish failed");
  }
}

function safeLogError(options: StartRunOptions, error: unknown, message: string): void {
  try {
    options.app.log.error({ err: error }, message);
  } catch {
    // Background tasks must never reject because failure reporting failed.
  }
}

function parseContent(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("content" in body)) return null;
  const content = body.content;
  if (typeof content !== "string") return null;
  const trimmed = content.trim();
  return trimmed ? trimmed : null;
}

function isProjectNotFoundError(error: unknown): boolean {
  return error instanceof ProjectNotFoundError;
}
