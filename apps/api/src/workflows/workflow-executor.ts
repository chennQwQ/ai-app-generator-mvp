import { exec } from "node:child_process";
import { nanoid } from "nanoid";
import type Database from "better-sqlite3";
import type { WorkflowGraph, WorkflowRun, WorkflowRunStatus } from "@ai-app-generator/shared";
import type { EventBus } from "../events/event-bus.js";
import type { AgentRunner } from "../agent/agent-runner.js";
import type { AuditService } from "../audit/audit-service.js";
import type { ProjectService } from "../projects/project-service.js";
import { WorkflowNotFoundError } from "./workflow-service.js";

export class WorkflowRunActiveError extends Error {
  constructor(projectId: string) {
    super(`Project ${projectId} already has an active workflow run`);
    this.name = "WorkflowRunActiveError";
  }
}

export class WorkflowExecutor {
  constructor(
    private readonly db: Database.Database,
    private readonly bus: EventBus,
    private readonly runner: AgentRunner,
    private readonly audit: AuditService,
    private readonly projects: ProjectService
  ) {}

  async execute(workflowId: string): Promise<WorkflowRun> {
    const workflowRow = this.db.prepare(
      "select * from workflows where id = ?"
    ).get(workflowId) as { id: string; project_id: string; name: string; graph: string } | undefined;
    if (!workflowRow) throw new WorkflowNotFoundError(workflowId);

    const graph = JSON.parse(workflowRow.graph) as WorkflowGraph;
    const projectId = workflowRow.project_id;

    const activeRun = this.db.prepare(
      "select 1 from workflow_runs where project_id = ? and status in ('queued', 'running') limit 1"
    ).get(projectId);
    if (activeRun) throw new WorkflowRunActiveError(projectId);

    const now = new Date().toISOString();
    const runId = nanoid();
    this.db.prepare(`
      insert into workflow_runs (id, workflow_id, project_id, status, runtime, external_run_id, started_at, created_at)
      values (?, ?, ?, 'queued', 'local', null, null, ?)
    `).run(runId, workflowId, projectId, now);

    const run = this.getRun(runId);

    void this.runGraph(workflowId, projectId, runId, graph);

    return run;
  }

  async cancel(runId: string): Promise<void> {
    const run = this.getRun(runId);
    if (run.status !== "queued" && run.status !== "running") {
      throw new Error("Workflow run is not active");
    }
    this.updateRunStatus(runId, "cancelled");
  }

  private async runGraph(
    workflowId: string,
    projectId: string,
    runId: string,
    graph: WorkflowGraph
  ): Promise<void> {
    try {
      this.updateRunStatus(runId, "running");
      this.bus.publish({
        type: "workflow.run.status",
        projectId,
        run: this.getRun(runId)
      });

      const sorted = topologicalSort(graph);
      if (!sorted) {
        this.updateRunStatus(runId, "failed");
        this.bus.publish({
          type: "workflow.run.status",
          projectId,
          run: this.getRun(runId)
        });
        return;
      }

      const nodeContexts = new Map<string, string>();

      for (const nodeId of sorted) {
        const run = this.getRun(runId);
        if (run.status === "cancelled") return;

        const node = graph.nodes.find((n) => n.id === nodeId);
        if (!node) continue;

        this.bus.publish({
          type: "workflow.node.status",
          projectId,
          nodeId: node.id,
          status: "running"
        });

        try {
          const inputText = this.buildNodeInput(node, graph, nodeContexts);
          let outputText = "";

          if (node.type === "user_input") {
            outputText = (node.data.prompt as string) ?? "";
          } else if (node.type === "agent_generation") {
            const workspacePath = this.projects.getWorkspacePath(projectId);
            const result = await this.runner.run({
              projectId,
              runId: nanoid(),
              workspacePath,
              prompt: inputText
            });
            outputText = `Agent exited with code ${result.exitCode}`;
          } else if (node.type === "shell_command") {
            const command = (node.data.command as string) ?? "";
            const workspacePath = this.projects.getWorkspacePath(projectId);
            outputText = await new Promise<string>((resolve, reject) => {
              exec(command, {
                cwd: workspacePath,
                encoding: "buffer",
                maxBuffer: 1024 * 1024,
                timeout: 30000
              }, (error, stdout, stderr) => {
                const output = (stdout.toString() + stderr.toString()).trim();
                if (error) {
                  this.audit.recordLog({
                    projectId,
                    runId: nanoid(),
                    toolName: "shell",
                    parameters: { command },
                    exitCode: (error as any).code ?? 1,
                    output: output || error.message
                  });
                  reject(error);
                } else {
                  this.audit.recordLog({
                    projectId,
                    runId: nanoid(),
                    toolName: "shell",
                    parameters: { command },
                    exitCode: 0,
                    output
                  });
                  resolve(output);
                }
              });
            });
          } else if (node.type === "http_request") {
            const url = (node.data.url as string) ?? "";
            const method = (node.data.method as string) ?? "GET";
            const response = await fetch(url, { method });
            outputText = `HTTP ${method} ${url} -> ${response.status}`;
            this.audit.recordLog({
              projectId,
              runId: nanoid(),
              toolName: "http_request",
              parameters: { url, method },
              exitCode: response.ok ? 0 : 1,
              output: outputText
            });
            if (!response.ok) {
              throw new Error(outputText);
            }
          }

          nodeContexts.set(node.id, outputText);

          this.bus.publish({
            type: "workflow.node.status",
            projectId,
            nodeId: node.id,
            status: "succeeded"
          });
        } catch (error) {
          this.bus.publish({
            type: "workflow.node.status",
            projectId,
            nodeId: node.id,
            status: "failed"
          });
          this.updateRunStatus(runId, "failed");
          this.bus.publish({
            type: "workflow.run.status",
            projectId,
            run: this.getRun(runId)
          });
          return;
        }
      }

      this.updateRunStatus(runId, "succeeded");
      this.bus.publish({
        type: "workflow.run.status",
        projectId,
        run: this.getRun(runId)
      });
    } catch (error) {
      this.updateRunStatus(runId, "failed");
      this.bus.publish({
        type: "workflow.run.status",
        projectId,
        run: this.getRun(runId)
      });
    }
  }

  private buildNodeInput(
    node: { id: string; data: Record<string, unknown> },
    graph: WorkflowGraph,
    contexts: Map<string, string>
  ): string {
    const incomingEdges = graph.edges.filter((e) => e.target === node.id);
    if (incomingEdges.length === 0) {
      return (node.data.prompt as string) ?? (node.data.command as string) ?? "";
    }
    return incomingEdges
      .map((e) => contexts.get(e.source) ?? "")
      .filter(Boolean)
      .join("\n");
  }

  getRun(runId: string): WorkflowRun {
    const row = this.db.prepare("select * from workflow_runs where id = ?").get(runId);
    if (!row) throw new Error(`Workflow run not found: ${runId}`);
    return this.mapRunRow(row);
  }

  listRuns(workflowId: string): WorkflowRun[] {
    return this.db.prepare(
      "select * from workflow_runs where workflow_id = ? order by created_at desc"
    ).all(workflowId).map((row) => this.mapRunRow(row));
  }

  private updateRunStatus(runId: string, status: WorkflowRunStatus): void {
    const now = new Date().toISOString();
    if (status === "running") {
      this.db.prepare(
        "update workflow_runs set status = ?, started_at = coalesce(started_at, ?) where id = ?"
      ).run(status, now, runId);
    } else if (status === "succeeded" || status === "failed" || status === "cancelled") {
      this.db.prepare(
        "update workflow_runs set status = ?, finished_at = ? where id = ?"
      ).run(status, now, runId);
    } else {
      this.db.prepare("update workflow_runs set status = ? where id = ?").run(status, runId);
    }
  }

  private mapRunRow(row: any): WorkflowRun {
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

function topologicalSort(graph: WorkflowGraph): string[] | null {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of graph.nodes) {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  for (const edge of graph.edges) {
    if (!inDegree.has(edge.source) || !inDegree.has(edge.target)) continue;
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    adjacency.get(edge.source)?.push(edge.target);
  }

  const queue: string[] = [];
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) queue.push(nodeId);
  }

  const result: string[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    result.push(nodeId);
    for (const neighbor of adjacency.get(nodeId) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  if (result.length !== graph.nodes.length) return null;
  return result;
}
