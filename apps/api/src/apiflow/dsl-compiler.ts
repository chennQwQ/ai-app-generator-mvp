import type { WorkflowGraph, WorkflowNode, WorkflowNodeType } from "@ai-app-generator/shared";
import { apiFlowCompatibleNodeTypes } from "@ai-app-generator/shared";

export class DslCompiler {
  compile(graph: WorkflowGraph): string {
    const lines: string[] = [];
    lines.push("init {");
    lines.push('    listen webhook on "/execute"');
    lines.push("}");
    lines.push("");

    const nodeTaskNames = new Map<string, string>();

    for (const nodeId of topologicalSort(graph) ?? graph.nodes.map((n) => n.id)) {
      const foundNode = graph.nodes.find((node) => node.id === nodeId);
      if (!foundNode) continue;

      if (foundNode.type === "user_input") {
        const taskName = `t_${sanitizeId(foundNode.id)}`;
        nodeTaskNames.set(foundNode.id, taskName);
        lines.push(`${taskName} = EVAL {`);
        lines.push(`    log.info("User input: \${input.prompt}")`);
        const prompt = String(foundNode.data.prompt ?? "");
        lines.push(`    "${escapeGroovyString(prompt)}"`);
        lines.push("}");
        lines.push("");
      } else if (foundNode.type === "http_request") {
        const taskName = `t_${sanitizeId(foundNode.id)}`;
        nodeTaskNames.set(foundNode.id, taskName);
        const url = String(foundNode.data.url ?? "");
        const method = String(foundNode.data.method ?? "GET");
        lines.push(`${taskName} = HTTP {`);
        if (method !== "GET") {
          lines.push(`    method = "${escapeGroovyString(method)}"`);
        }
        lines.push(`    url = "${escapeGroovyString(url)}"`);
        lines.push("}");
        lines.push("");
      }
    }

    lines.push("start {");
    const sorted = topologicalSort(graph);
    const order = sorted ?? graph.nodes.map((n) => n.id);
    for (const nodeId of order) {
      const taskName = nodeTaskNames.get(nodeId);
      if (taskName) {
        lines.push(`    run ${taskName}`);
      }
    }
    lines.push("}");

    return lines.join("\n");
  }

  validateForExport(graph: WorkflowGraph): { valid: boolean; unsupportedNodes: string[]; errors: string[] } {
    const unsupportedNodes: string[] = [];
    const errors: string[] = [];

    if (graph.nodes.length === 0) {
      errors.push("Workflow graph has no nodes");
      return { valid: false, unsupportedNodes, errors };
    }

    for (const node of graph.nodes) {
      if (!(apiFlowCompatibleNodeTypes as readonly string[]).includes(node.type)) {
        unsupportedNodes.push(node.id);
        errors.push(`Node "${node.id}" has unsupported type "${node.type}". ApiFlow v1 supports: ${apiFlowCompatibleNodeTypes.join(", ")}`);
      }
    }

    const sorted = topologicalSort(graph);
    if (!sorted && graph.nodes.length > 0) {
      errors.push("Workflow graph contains cycles and cannot be executed sequentially");
    }

    return { valid: errors.length === 0, unsupportedNodes, errors };
  }
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, "_");
}

function escapeGroovyString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
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
