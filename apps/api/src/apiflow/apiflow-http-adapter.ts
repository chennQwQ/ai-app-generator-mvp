import type { ApiFlowExportInput, ApiFlowExportResult, ApiFlowExternalRun, ApiFlowRunInput } from "@ai-app-generator/shared";
import type { ApiFlowRuntimeAdapter } from "./apiflow-adapter.js";
import { ApiFlowExportValidationError, DslCompiler } from "./dsl-compiler.js";

export interface HttpApiFlowConfig {
  baseUrl: string;
  timeout?: number;
}

type SidecarRunResponse = Partial<ApiFlowExternalRun> & {
  runId?: string;
  externalRunId?: string;
};

export class HttpApiFlowRuntimeAdapter implements ApiFlowRuntimeAdapter {
  private readonly compiler = new DslCompiler();

  constructor(private readonly config: HttpApiFlowConfig) {}

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
    const dsl = input.dsl ?? (await this.exportWorkflow(input)).dsl;

    const response = await this.request<SidecarRunResponse>(
      `/api/apiflow/workflows/${encodeURIComponent(input.workflowId)}/runs`,
      {
        method: "POST",
        body: JSON.stringify({
          workflowId: input.workflowId,
          workflowName: input.workflowName,
          dsl,
          input: input.input ?? {}
        })
      }
    );

    const externalRunId = response.externalRunId ?? response.runId;
    if (!externalRunId) throw new Error("ApiFlow sidecar response did not include a run id");

    return {
      externalRunId,
      workflowId: response.workflowId ?? input.workflowId,
      status: response.status ?? "queued",
      result: response.result ?? null,
      error: response.error ?? null,
      startedAt: response.startedAt ?? null,
      finishedAt: response.finishedAt ?? null,
      createdAt: response.createdAt ?? new Date().toISOString()
    };
  }

  async getRun(externalRunId: string): Promise<ApiFlowExternalRun> {
    return this.request<ApiFlowExternalRun>(
      `/api/apiflow/runs/${encodeURIComponent(externalRunId)}`
    );
  }

  async cancelRun(externalRunId: string): Promise<void> {
    await this.request(
      `/api/apiflow/runs/${encodeURIComponent(externalRunId)}/cancel`,
      { method: "POST" }
    );
  }

  async healthCheck(): Promise<{ ok: boolean; reason?: string }> {
    try {
      await this.request("/api/apiflow/health");
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : "ApiFlow sidecar unreachable"
      };
    }
  }

  private async request<T = void>(
    path: string,
    init: RequestInit = {}
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout ?? 10000);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...init.headers
        }
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`ApiFlow sidecar returned ${response.status}: ${body}`);
      }

      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}
