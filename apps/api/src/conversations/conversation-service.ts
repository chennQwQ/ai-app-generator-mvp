import { nanoid } from "nanoid";
import type Database from "better-sqlite3";
import type {
  AgentLog,
  AgentLogStream,
  AgentRun,
  AgentRunStatus,
  ChatMessage
} from "@ai-app-generator/shared";

export class ConversationNotFoundError extends Error {
  constructor(projectId: string) {
    super(`Conversation not found for project: ${projectId}`);
    this.name = "ConversationNotFoundError";
  }
}

export class ActiveAgentRunError extends Error {
  constructor(projectId: string) {
    super(`Agent run already active for project: ${projectId}`);
    this.name = "ActiveAgentRunError";
  }
}

export class ConversationService {
  constructor(private readonly db: Database.Database) {}

  listMessages(projectId: string): ChatMessage[] {
    const conversation = this.getConversation(projectId);
    return this.db
      .prepare(
        `
          select *
          from messages
          where conversation_id = ?
          order by created_at asc, id asc
        `
      )
      .all(conversation.id)
      .map(mapMessage);
  }

  hasActiveRun(projectId: string): boolean {
    const row = this.db
      .prepare(
        `
          select 1
          from agent_runs
          where project_id = ?
            and status in ('queued', 'running')
          limit 1
        `
      )
      .get(projectId);
    return Boolean(row);
  }

  createUserMessage(projectId: string, content: string, agentRunId: string | null): ChatMessage {
    const conversation = this.getConversation(projectId);
    const now = new Date().toISOString();
    const messageId = nanoid();
    this.db
      .prepare(
        `
          insert into messages (id, conversation_id, role, content, agent_run_id, created_at)
          values (?, ?, 'user', ?, ?, ?)
        `
      )
      .run(messageId, conversation.id, content, agentRunId, now);
    this.touchConversation(conversation.id, now);
    return this.getMessage(messageId);
  }

  createUserMessageWithRun(
    projectId: string,
    content: string,
    command: string
  ): { message: ChatMessage; run: AgentRun } {
    return this.db.transaction(() => {
      const conversation = this.getConversation(projectId);
      if (this.hasActiveRun(projectId)) throw new ActiveAgentRunError(projectId);

      const now = new Date().toISOString();
      const runId = nanoid();
      const messageId = nanoid();

      this.db
        .prepare(
          `
            insert into agent_runs (
              id, project_id, conversation_id, status, prompt, command, created_at
            )
            values (?, ?, ?, 'queued', ?, ?, ?)
          `
        )
        .run(runId, projectId, conversation.id, content, command, now);

      this.db
        .prepare(
          `
            insert into messages (id, conversation_id, role, content, agent_run_id, created_at)
            values (?, ?, 'user', ?, ?, ?)
          `
        )
        .run(messageId, conversation.id, content, runId, now);

      this.touchConversation(conversation.id, now);

      return {
        message: this.getMessage(messageId),
        run: this.getAgentRun(runId)
      };
    })();
  }

  createAgentRun(
    projectId: string,
    prompt: string,
    command: string,
    conversationId: string | null = null
  ): AgentRun {
    return this.db.transaction(() => {
      const conversation = conversationId
        ? this.getConversationById(projectId, conversationId)
        : this.getConversation(projectId);
      if (this.hasActiveRun(projectId)) throw new ActiveAgentRunError(projectId);

      const now = new Date().toISOString();
      const runId = nanoid();

      this.db
        .prepare(
          `
            insert into agent_runs (
              id, project_id, conversation_id, status, prompt, command, created_at
            )
            values (?, ?, ?, 'queued', ?, ?, ?)
          `
        )
        .run(runId, projectId, conversation.id, prompt, command, now);

      this.touchConversation(conversation.id, now);
      return this.getAgentRun(runId);
    })();
  }

  updateAgentRunStatus(
    runId: string,
    status: AgentRunStatus,
    fields: { exitCode?: number | null; errorMessage?: string | null } = {}
  ): AgentRun {
    const now = new Date().toISOString();
    const startedAtSql = status === "running" ? ", started_at = coalesce(started_at, @now)" : "";
    const finishedAtSql =
      status === "succeeded" || status === "failed" || status === "cancelled"
        ? ", finished_at = @now"
        : "";

    this.db
      .prepare(
        `
          update agent_runs
          set status = @status,
              exit_code = @exitCode,
              error_message = @errorMessage
              ${startedAtSql}
              ${finishedAtSql}
          where id = @runId
        `
      )
      .run({
        runId,
        status,
        exitCode: fields.exitCode ?? null,
        errorMessage: fields.errorMessage ?? null,
        now
      });

    return this.getAgentRun(runId);
  }

  recordAgentLog(runId: string, stream: AgentLogStream, content: string): AgentLog {
    return this.db.transaction(() => {
      const sequenceRow = this.db
        .prepare("select coalesce(max(sequence), -1) + 1 as sequence from agent_logs where agent_run_id = ?")
        .get(runId) as { sequence: number };
      const id = nanoid();
      const now = new Date().toISOString();
      this.db
        .prepare(
          `
            insert into agent_logs (id, agent_run_id, stream, content, sequence, created_at)
            values (?, ?, ?, ?, ?, ?)
          `
        )
        .run(id, runId, stream, content, sequenceRow.sequence, now);
      return this.getAgentLog(id);
    })();
  }

  getAgentRun(runId: string): AgentRun {
    const row = this.db.prepare("select * from agent_runs where id = ?").get(runId);
    if (!row) throw new Error(`Agent run not found: ${runId}`);
    return mapAgentRun(row);
  }

  listAgentRuns(projectId: string): AgentRun[] {
    return this.db
      .prepare("select * from agent_runs where project_id = ? order by created_at desc")
      .all(projectId)
      .map(mapAgentRun);
  }

  listAgentLogs(runId: string): AgentLog[] {
    return this.db
      .prepare("select * from agent_logs where agent_run_id = ? order by sequence asc")
      .all(runId)
      .map(mapAgentLog);
  }

  private getConversation(projectId: string): { id: string } {
    const row = this.db
      .prepare("select id from conversations where project_id = ? order by created_at asc limit 1")
      .get(projectId) as { id: string } | undefined;
    if (!row) throw new ConversationNotFoundError(projectId);
    return row;
  }

  private getConversationById(projectId: string, conversationId: string): { id: string } {
    const row = this.db
      .prepare("select id from conversations where id = ? and project_id = ? limit 1")
      .get(conversationId, projectId) as { id: string } | undefined;
    if (!row) throw new ConversationNotFoundError(projectId);
    return row;
  }

  private getMessage(messageId: string): ChatMessage {
    const row = this.db.prepare("select * from messages where id = ?").get(messageId);
    if (!row) throw new Error(`Message not found: ${messageId}`);
    return mapMessage(row);
  }

  private getAgentLog(logId: string): AgentLog {
    const row = this.db.prepare("select * from agent_logs where id = ?").get(logId);
    if (!row) throw new Error(`Agent log not found: ${logId}`);
    return mapAgentLog(row);
  }

  private touchConversation(conversationId: string, updatedAt: string): void {
    this.db
      .prepare("update conversations set updated_at = ? where id = ?")
      .run(updatedAt, conversationId);
  }
}

function mapMessage(row: any): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    agentRunId: row.agent_run_id,
    createdAt: row.created_at
  };
}

function mapAgentRun(row: any): AgentRun {
  return {
    id: row.id,
    projectId: row.project_id,
    conversationId: row.conversation_id,
    status: row.status,
    prompt: row.prompt,
    command: row.command,
    exitCode: row.exit_code,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at
  };
}

function mapAgentLog(row: any): AgentLog {
  return {
    id: row.id,
    agentRunId: row.agent_run_id,
    stream: row.stream,
    content: row.content,
    sequence: row.sequence,
    createdAt: row.created_at
  };
}
