import type { ApiFlowExportInput, ApiFlowExportResult, ApiFlowExternalRun, ApiFlowRunInput } from "@ai-app-generator/shared";
import { nanoid } from "nanoid";
import { ApiFlowExportValidationError, DslCompiler } from "./dsl-compiler.js";

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

  async exportWorkflow(input: ApiFlowExportInput): Promise<ApiFlowExportResult> {
    const validation = this.compiler.validateForExport(input.graph);
    if (!validation.valid) {
      throw new ApiFlowExportValidationError(validation.errors, validation.unsupportedNodes);
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
    if (!input.dsl) await this.exportWorkflow(input);

    const externalRunId = `apiflow-fake-${input.workflowId}-${nanoid()}`;
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

    setTimeout(() => {
      if (run.status === "cancelled") return;
      run.status = "running";
      run.startedAt = new Date().toISOString();

      setTimeout(() => {
        if (run.status === "cancelled") return;
        run.status = "succeeded";
        run.finishedAt = new Date().toISOString();
        run.result = "Fake ApiFlow execution completed";
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
