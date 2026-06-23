import type { ApiFlowExportInput, ApiFlowExportResult, ApiFlowExternalRun, ApiFlowRunInput } from "@ai-app-generator/shared";
import type { EventBus } from "../events/event-bus.js";
import { DslCompiler } from "./dsl-compiler.js";

export interface ApiFlowRuntimeAdapter {
  exportWorkflow(input: ApiFlowExportInput): Promise<ApiFlowExportResult>;
  startRun(input: ApiFlowRunInput): Promise<ApiFlowExternalRun>;
  getRun(externalRunId: string): Promise<ApiFlowExternalRun>;
  cancelRun(externalRunId: string): Promise<void>;
  healthCheck(): Promise<{ ok: boolean; reason?: string }>;
}

export class FakeApiFlowRuntimeAdapter implements ApiFlowRuntimeAdapter {
  private readonly runs = new Map<string, ApiFlowExternalRun>();
  private readonly compiler = new DslCompiler();

  constructor(private readonly bus: EventBus) {}

  async exportWorkflow(input: ApiFlowExportInput): Promise<ApiFlowExportResult> {
    const validation = this.compiler.validateForExport(input.graph);
    if (!validation.valid) {
      throw new Error(validation.errors.join("; "));
    }
    return {
      version: 1,
      projectId: input.projectId,
      workflowId: input.workflowId,
      dsl: this.compiler.compile(input.graph),
      entryNodeIds: input.graph.nodes
        .filter((n) => !input.graph.edges.some((e) => e.target === n.id))
        .map((n) => n.id),
      unsupportedNodes: []
    };
  }

  async startRun(input: ApiFlowRunInput): Promise<ApiFlowExternalRun> {
    const externalRunId = `apiflow-fake-${input.workflowId}-${Date.now()}`;
    const now = new Date().toISOString();
    const run: ApiFlowExternalRun = {
      externalRunId,
      workflowId: input.workflowId,
      status: "queued",
      result: null,
      error: null,
      startedAt: null,
      finishedAt: null,
      createdAt: now
    };
    this.runs.set(externalRunId, run);

    this.bus.publish({
      type: "workflow.run.status",
      projectId: input.projectId,
      run: {
        id: externalRunId,
        workflowId: input.workflowId,
        projectId: input.projectId,
        status: "queued",
        startedAt: null,
        finishedAt: null,
        createdAt: now
      }
    });

    setTimeout(() => {
      run.status = "running";
      run.startedAt = new Date().toISOString();
      this.bus.publish({
        type: "workflow.run.status",
        projectId: input.projectId,
        run: {
          id: externalRunId,
          workflowId: input.workflowId,
          projectId: input.projectId,
          status: "running",
          startedAt: run.startedAt,
          finishedAt: null,
          createdAt: run.createdAt
        }
      });

      setTimeout(() => {
        run.status = "succeeded";
        run.finishedAt = new Date().toISOString();
        run.result = "Fake ApiFlow execution completed";
        this.bus.publish({
          type: "workflow.run.status",
          projectId: input.projectId,
          run: {
            id: externalRunId,
            workflowId: input.workflowId,
            projectId: input.projectId,
            status: "succeeded",
            startedAt: run.startedAt,
            finishedAt: run.finishedAt,
            createdAt: run.createdAt
          }
        });
      }, 500);
    }, 100);

    return run;
  }

  async getRun(externalRunId: string): Promise<ApiFlowExternalRun> {
    const run = this.runs.get(externalRunId);
    if (!run) throw new Error(`ApiFlow run not found: ${externalRunId}`);
    return run;
  }

  async cancelRun(externalRunId: string): Promise<void> {
    const run = this.runs.get(externalRunId);
    if (!run) throw new Error(`ApiFlow run not found: ${externalRunId}`);
    if (run.status === "queued" || run.status === "running") {
      run.status = "cancelled";
      run.finishedAt = new Date().toISOString();
    }
  }

  async healthCheck(): Promise<{ ok: boolean; reason?: string }> {
    return { ok: true };
  }
}
