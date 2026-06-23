import { nanoid } from "nanoid";
import type Database from "better-sqlite3";
import type { WorkflowGraph, WorkflowRun } from "@ai-app-generator/shared";
import type { EventBus } from "../events/event-bus.js";
import type { ApiFlowRuntimeAdapter } from "./apiflow-adapter.js";

export class ApiFlowBridge {
  constructor(
    private readonly db: Database.Database,
    private readonly bus: EventBus,
    private readonly adapter: ApiFlowRuntimeAdapter
  ) {}

  async startRun(workflowId: string, projectId: string, workflowName: string, graph: WorkflowGraph): Promise<WorkflowRun> {
    const external = await this.adapter.startRun({
      projectId,
      workflowId,
      workflowName,
      graph
    });

    const now = new Date().toISOString();
    const runId = nanoid();
    this.db.prepare(`
      insert into workflow_runs (id, workflow_id, project_id, status, started_at, created_at)
      values (?, ?, ?, 'queued', null, ?)
    `).run(runId, workflowId, projectId, now);

    const run = this.getRun(runId);
    this.bus.publish({ type: "workflow.run.status", projectId, run });
    return run;
  }

  private getRun(runId: string): WorkflowRun {
    const row = this.db.prepare("select * from workflow_runs where id = ?").get(runId) as any;
    if (!row) throw new Error(`Workflow run not found: ${runId}`);
    return {
      id: row.id,
      workflowId: row.workflow_id,
      projectId: row.project_id,
      status: row.status,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      createdAt: row.created_at
    };
  }
}
