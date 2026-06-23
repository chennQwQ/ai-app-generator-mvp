import type { ApiFlowExportInput, ApiFlowExportResult, ApiFlowExternalRun, ApiFlowRunInput, WorkflowGraph } from "@ai-app-generator/shared";
import { apiFlowCompatibleNodeTypes } from "@ai-app-generator/shared";
import type { EventBus } from "../events/event-bus.js";

export interface ApiFlowRuntimeAdapter {
  exportWorkflow(input: ApiFlowExportInput): Promise<ApiFlowExportResult>;
  startRun(input: ApiFlowRunInput): Promise<ApiFlowExternalRun>;
  getRun(externalRunId: string): Promise<ApiFlowExternalRun>;
  cancelRun(externalRunId: string): Promise<void>;
  healthCheck(): Promise<{ ok: boolean; reason?: string }>;
}

export class FakeApiFlowRuntimeAdapter implements ApiFlowRuntimeAdapter {
  private readonly runs = new Map<string, ApiFlowExternalRun>();

  constructor(private readonly bus: EventBus) {}

  async exportWorkflow(input: ApiFlowExportInput): Promise<ApiFlowExportResult> {
    const unsupportedNodes = input.graph.nodes
      .filter((n) => !(apiFlowCompatibleNodeTypes as readonly string[]).includes(n.type))
      .map((n) => n.id);

    const lines: string[] = [];
    lines.push("init {");
    lines.push('    listen webhook on "/execute"');
    lines.push("}");
    lines.push("");

    for (const node of input.graph.nodes) {
      if (node.type === "user_input") {
        lines.push(`t_${sanitizeId(node.id)} = EVAL {`);
        lines.push('    log.info("User input: ${input.prompt}")');
        lines.push(`    "${String(node.data.prompt ?? "")}"`);
        lines.push("}");
        lines.push("");
      }
    }

    lines.push("start {");
    const sorted = topologicalSort(input.graph);
    if (sorted) {
      for (const nodeId of sorted) {
        const node = input.graph.nodes.find((n) => n.id === nodeId);
        if (node && (apiFlowCompatibleNodeTypes as readonly string[]).includes(node.type)) {
          lines.push(`    run t_${sanitizeId(nodeId)}`);
        }
      }
    }
    lines.push("}");

    return {
      version: 1,
      projectId: input.projectId,
      workflowId: input.workflowId,
      dsl: lines.join("\n"),
      entryNodeIds: input.graph.nodes
        .filter((n) => !input.graph.edges.some((e) => e.target === n.id))
        .map((n) => n.id),
      unsupportedNodes
    };
  }

  async startRun(input: ApiFlowRunInput): Promise<ApiFlowExternalRun> {
    const externalRunId = `apiflow-fake-${input.workflowId}-${Date.now()}`;
    const run: ApiFlowExternalRun = {
      externalRunId,
      workflowId: input.workflowId,
      status: "queued",
      result: null,
      error: null,
      startedAt: null,
      finishedAt: null,
      createdAt: new Date().toISOString()
    };
    this.runs.set(externalRunId, run);

    // Simulate async execution
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
          createdAt: new Date().toISOString()
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

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, "_");
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
