import type { FastifyInstance } from "fastify";
import { isTerminalRunStatus, type AgentLogStream, type AgentRun } from "@ai-app-generator/shared";
import type { AgentRunner } from "../agent/agent-runner.js";
import {
  ActiveAgentRunError,
  ConversationNotFoundError,
  type ConversationService
} from "../conversations/conversation-service.js";
import type { EventBus } from "../events/event-bus.js";
import { ProjectNotFoundError, type ProjectService } from "../projects/project-service.js";

export async function registerInternalAgentRunRoutes(
  app: FastifyInstance,
  projects: ProjectService,
  conversations: ConversationService,
  runner: AgentRunner,
  bus: EventBus
) {
  let closed = false;
  app.addHook("onClose", async () => {
    closed = true;
  });

  app.post("/internal/agent-runs", async (request, reply) => {
    const parsed = parseBody(request.body);
    if (!parsed) {
      return reply.code(400).send({ message: "projectId, workflowRunId, nodeId, and prompt are required" });
    }

    let workspacePath: string;
    try {
      workspacePath = projects.getWorkspacePath(parsed.projectId);
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        return reply.code(404).send({ message: "Project not found" });
      }
      request.log.error({ err: error }, "Internal agent run project lookup failed");
      return reply.code(500).send({ message: "Internal agent run creation failed" });
    }

    const agentHealth = await runner.healthCheck();
    if (!agentHealth.ok) {
      const reason = agentHealth.reason ?? "Agent is not configured";
      request.log.error({ reason }, "Agent health check failed");
      return reply.code(500).send({
        message: `Agent is not available: ${reason}. Please check your Agent provider configuration and ensure the required command is installed.`
      });
    }

    let run: AgentRun;
    try {
      run = conversations.createAgentRun(
        parsed.projectId,
        parsed.prompt,
        runner.command,
        parsed.conversationId
      );
      run = conversations.updateAgentRunStatus(run.id, "running");
    } catch (error) {
      if (error instanceof ActiveAgentRunError) {
        return reply.code(409).send({ message: "Agent run already active" });
      }
      if (error instanceof ConversationNotFoundError) {
        return reply.code(404).send({ message: "Conversation not found" });
      }
      request.log.error({ err: error }, "Internal agent run creation failed");
      return reply.code(500).send({ message: "Internal agent run creation failed" });
    }

    bus.publish({ type: "run.status", projectId: parsed.projectId, run });
    bus.publish({
      type: "workflow.node.status",
      projectId: parsed.projectId,
      nodeId: parsed.nodeId,
      status: "running"
    });

    startRun({
      app,
      projectId: parsed.projectId,
      nodeId: parsed.nodeId,
      workspacePath,
      prompt: parsed.prompt,
      run,
      conversations,
      runner,
      bus,
      isClosed: () => closed
    });

    return reply.code(202).send({
      workflowRunId: parsed.workflowRunId,
      nodeId: parsed.nodeId,
      run
    });
  });
}

interface ParsedInternalAgentRunBody {
  projectId: string;
  workflowRunId: string;
  nodeId: string;
  prompt: string;
  conversationId: string | null;
}

function parseBody(body: unknown): ParsedInternalAgentRunBody | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const projectId = parseRequiredString(record.projectId);
  const workflowRunId = parseRequiredString(record.workflowRunId);
  const nodeId = parseRequiredString(record.nodeId);
  const prompt = parseRequiredString(record.prompt);
  const conversationId = parseOptionalString(record.conversationId);

  if (!projectId || !workflowRunId || !nodeId || !prompt) return null;
  return { projectId, workflowRunId, nodeId, prompt, conversationId };
}

function parseRequiredString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function startRun(options: {
  app: FastifyInstance;
  projectId: string;
  nodeId: string;
  workspacePath: string;
  prompt: string;
  run: AgentRun;
  conversations: ConversationService;
  runner: AgentRunner;
  bus: EventBus;
  isClosed: () => boolean;
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
      if (options.isClosed() || isRunAlreadyTerminal(options)) return;
      const status = result.exitCode === 0 ? "succeeded" : "failed";
      const completedRun = safeUpdateAgentRunStatus(options, status, result);
      if (completedRun) {
        safePublish(options, { type: "run.status", projectId: options.projectId, run: completedRun });
        safePublish(options, {
          type: "workflow.node.status",
          projectId: options.projectId,
          nodeId: options.nodeId,
          status
        });
      }
      if (status === "succeeded") {
        safePublish(options, { type: "files.changed", projectId: options.projectId });
      }
    } catch (error) {
      if (options.isClosed() || isRunAlreadyTerminal(options)) return;
      safeLogError(options, error, "Internal agent run failed");
      const failedRun = safeUpdateAgentRunStatus(options, "failed", {
        exitCode: 1,
        errorMessage: "Agent run failed"
      });
      if (failedRun) {
        safePublish(options, { type: "run.status", projectId: options.projectId, run: failedRun });
        safePublish(options, {
          type: "workflow.node.status",
          projectId: options.projectId,
          nodeId: options.nodeId,
          status: "failed"
        });
      }
    }
  })().catch((error) => {
    safeLogError(options, error, "Background internal agent task failed");
  });
}

type StartRunOptions = Parameters<typeof startRun>[0];

function recordAndPublishLog(
  options: StartRunOptions,
  stream: AgentLogStream,
  content: string
): void {
  if (options.isClosed()) return;
  try {
    const log = options.conversations.recordAgentLog(options.run.id, stream, content);
    safePublish(options, { type: "run.log", projectId: options.projectId, log });
  } catch (error) {
    safeLogError(options, error, "Agent log recording failed");
  }
}

function isRunAlreadyTerminal(options: StartRunOptions): boolean {
  try {
    return isTerminalRunStatus(options.conversations.getAgentRun(options.run.id).status);
  } catch (error) {
    safeLogError(options, error, "Agent run lookup failed");
    return true;
  }
}

function safeUpdateAgentRunStatus(
  options: StartRunOptions,
  status: AgentRun["status"],
  fields: { exitCode?: number | null; errorMessage?: string | null } = {}
): AgentRun | null {
  if (options.isClosed()) return null;
  try {
    return options.conversations.updateAgentRunStatus(options.run.id, status, fields);
  } catch (error) {
    safeLogError(options, error, "Agent run status update failed");
    return null;
  }
}

function safePublish(options: StartRunOptions, event: Parameters<EventBus["publish"]>[0]): void {
  if (options.isClosed()) return;
  try {
    options.bus.publish(event);
  } catch (error) {
    safeLogError(options, error, "Project event publish failed");
  }
}

function safeLogError(options: StartRunOptions, error: unknown, message: string): void {
  if (options.isClosed()) return;
  try {
    options.app.log.error({ err: error }, message);
  } catch {
    // Background tasks must never reject because failure reporting failed.
  }
}
