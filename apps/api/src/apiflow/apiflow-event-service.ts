import type Database from "better-sqlite3";
import type { EventBus } from "../events/event-bus.js";

const taskEventStatuses = ["queued", "running", "succeeded", "failed", "cancelled"] as const;

export type ApiFlowTaskEventStatus = (typeof taskEventStatuses)[number];

export interface ApiFlowTaskEventInput {
  projectId?: string | null;
  workflowRunId: string;
  taskId: string;
  status: string;
}

export interface ApiFlowTaskEventResult {
  projectId: string;
  workflowRunId: string;
  taskId: string;
  nodeId: string;
  status: ApiFlowTaskEventStatus;
}

export class WorkflowTaskMappingNotFoundError extends Error {
  constructor(workflowRunId: string, taskId: string) {
    super(`Workflow task mapping not found for ${workflowRunId}:${taskId}`);
    this.name = "WorkflowTaskMappingNotFoundError";
  }
}

export class InvalidApiFlowTaskEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidApiFlowTaskEventError";
  }
}

export class ApiFlowEventService {
  constructor(
    private readonly db: Database.Database,
    private readonly bus: EventBus
  ) {}

  storeTaskNodeMap(workflowRunId: string, nodeMap: Record<string, string> | undefined): void {
    if (!nodeMap || Object.keys(nodeMap).length === 0) return;

    this.db.transaction(() => {
      const now = new Date().toISOString();
      const insert = this.db.prepare(`
        insert into workflow_task_nodes (workflow_run_id, task_id, node_id, created_at)
        values (?, ?, ?, ?)
        on conflict(workflow_run_id, task_id) do update set
          node_id = excluded.node_id,
          created_at = excluded.created_at
      `);

      for (const [taskId, nodeId] of Object.entries(nodeMap)) {
        insert.run(workflowRunId, taskId, nodeId, now);
      }
    })();
  }

  publishTaskEvent(input: ApiFlowTaskEventInput): ApiFlowTaskEventResult {
    const workflowRunId = normalizeRequiredString(input.workflowRunId, "workflowRunId");
    const taskId = normalizeRequiredString(input.taskId, "taskId");
    const status = normalizeStatus(input.status);

    const row = this.db.prepare(`
      select workflow_runs.project_id as project_id,
             workflow_task_nodes.node_id as node_id
      from workflow_task_nodes
      join workflow_runs on workflow_runs.id = workflow_task_nodes.workflow_run_id
      where workflow_task_nodes.workflow_run_id = ?
        and workflow_task_nodes.task_id = ?
      limit 1
    `).get(workflowRunId, taskId) as { project_id: string; node_id: string } | undefined;

    if (!row || (input.projectId && input.projectId !== row.project_id)) {
      throw new WorkflowTaskMappingNotFoundError(workflowRunId, taskId);
    }

    const result: ApiFlowTaskEventResult = {
      projectId: row.project_id,
      workflowRunId,
      taskId,
      nodeId: row.node_id,
      status
    };

    this.bus.publish({
      type: "workflow.node.status",
      projectId: result.projectId,
      nodeId: result.nodeId,
      status: result.status
    });

    return result;
  }
}

function normalizeRequiredString(value: string, key: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new InvalidApiFlowTaskEventError(`${key} is required`);
  }
  return value.trim();
}

function normalizeStatus(value: string): ApiFlowTaskEventStatus {
  if (typeof value !== "string" || !value.trim()) {
    throw new InvalidApiFlowTaskEventError("status is required");
  }

  const normalized = value.trim();
  if (!(taskEventStatuses as readonly string[]).includes(normalized)) {
    throw new InvalidApiFlowTaskEventError(`Unsupported ApiFlow task status: ${normalized}`);
  }

  return normalized as ApiFlowTaskEventStatus;
}
