import { nanoid } from "nanoid";
import type Database from "better-sqlite3";
import type { ApiFlowExternalRun, WorkflowDetail, WorkflowRun, WorkflowRunStatus } from "@ai-app-generator/shared";
import type { EventBus } from "../events/event-bus.js";
import { WorkflowRunActiveError } from "../workflows/workflow-executor.js";
import type { ApiFlowRuntimeAdapter } from "./apiflow-adapter.js";

export class ApiFlowBridge {
  constructor(
    private readonly db: Database.Database,
    private readonly bus: EventBus,
    private readonly adapter: ApiFlowRuntimeAdapter,
    private readonly pollIntervalMs = 100,
    private readonly maxPolls = 200
  ) {}

  async startRun(workflow: WorkflowDetail): Promise<WorkflowRun> {
    const activeRun = this.db.prepare(
      "select 1 from workflow_runs where project_id = ? and status in ('queued', 'running') limit 1"
    ).get(workflow.projectId);
    if (activeRun) throw new WorkflowRunActiveError(workflow.projectId);

    const external = await this.adapter.startRun({
      projectId: workflow.projectId,
      workflowId: workflow.id,
      workflowName: workflow.name,
      graph: workflow.graph
    });

    const now = new Date().toISOString();
    const runId = nanoid();
    this.db.prepare(`
      insert into workflow_runs (
        id,
        workflow_id,
        project_id,
        status,
        runtime,
        external_run_id,
        started_at,
        finished_at,
        created_at
      )
      values (?, ?, ?, ?, 'apiflow', ?, ?, ?, ?)
    `).run(
      runId,
      workflow.id,
      workflow.projectId,
      external.status,
      external.externalRunId,
      external.startedAt,
      external.finishedAt,
      now
    );

    const run = this.getRun(runId);
    this.bus.publish({ type: "workflow.run.status", projectId: workflow.projectId, run });
    void this.pollExternalRun(runId, workflow.projectId, external.externalRunId);
    return run;
  }

  private async pollExternalRun(runId: string, projectId: string, externalRunId: string): Promise<void> {
    try {
      for (let attempt = 0; attempt < this.maxPolls; attempt++) {
        await delay(this.pollIntervalMs);

        const localRun = this.getRun(runId);
        if (isTerminalStatus(localRun.status)) return;

        const external = await this.adapter.getRun(externalRunId);
        this.updateRunFromExternal(runId, external);
        const updated = this.getRun(runId);
        this.bus.publish({ type: "workflow.run.status", projectId, run: updated });
        if (isTerminalStatus(updated.status)) return;
      }
    } catch (error) {
      try {
        this.updateRunStatus(runId, "failed");
        const failed = this.getRun(runId);
        this.bus.publish({ type: "workflow.run.status", projectId, run: failed });
      } catch {
        // The server may be shutting down while a background poll is in flight.
      }
    }
  }

  private updateRunFromExternal(runId: string, external: ApiFlowExternalRun): void {
    this.db.prepare(`
      update workflow_runs
      set status = ?,
          started_at = coalesce(?, started_at),
          finished_at = coalesce(?, finished_at)
      where id = ?
    `).run(external.status, external.startedAt, external.finishedAt, runId);
  }

  private updateRunStatus(runId: string, status: WorkflowRunStatus): void {
    const now = new Date().toISOString();
    if (isTerminalStatus(status)) {
      this.db.prepare("update workflow_runs set status = ?, finished_at = coalesce(finished_at, ?) where id = ?")
        .run(status, now, runId);
      return;
    }

    this.db.prepare("update workflow_runs set status = ? where id = ?").run(status, runId);
  }

  private getRun(runId: string): WorkflowRun {
    const row = this.db.prepare("select * from workflow_runs where id = ?").get(runId) as any;
    if (!row) throw new Error(`Workflow run not found: ${runId}`);
    return {
      id: row.id,
      workflowId: row.workflow_id,
      projectId: row.project_id,
      status: row.status,
      runtime: row.runtime ?? "local",
      externalRunId: row.external_run_id ?? null,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      createdAt: row.created_at
    };
  }
}

function isTerminalStatus(status: WorkflowRunStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
