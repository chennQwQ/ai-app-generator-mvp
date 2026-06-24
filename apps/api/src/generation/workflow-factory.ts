import type { WorkflowGraph, WorkflowNode, WorkflowNodeType } from "@ai-app-generator/shared";
import type { GenerationRoute } from "./generation-router.js";

export interface WorkflowFactoryInput {
  route: GenerationRoute;
  prompt: string;
}

export interface GeneratedWorkflow {
  name: string;
  graph: WorkflowGraph;
  dsl: string;
  nodeMap: Record<string, string>;
}

interface WorkflowStep {
  nodeId: string;
  taskName: string;
  nodeType: WorkflowNodeType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  dslKind: "eval_prompt" | "opencode_callback";
}

export class UnsupportedGenerationRouteError extends Error {
  constructor(route: GenerationRoute) {
    super(`Generation route ${route} cannot produce an app workflow`);
    this.name = "UnsupportedGenerationRouteError";
  }
}

export class WorkflowFactory {
  create(input: WorkflowFactoryInput): GeneratedWorkflow {
    const prompt = input.prompt.trim();
    if (!prompt) throw new Error("Generation prompt is required");
    if (input.route !== "create_app_from_prompt" && input.route !== "modify_app_from_prompt") {
      throw new UnsupportedGenerationRouteError(input.route);
    }

    const steps: WorkflowStep[] = [
      {
        nodeId: "node_parse_request",
        taskName: "task_parse_request",
        nodeType: "user_input",
        position: { x: 0, y: 0 },
        data: { prompt },
        dslKind: "eval_prompt"
      },
      {
        nodeId: "node_run_opencode",
        taskName: "task_run_opencode",
        nodeType: "agent_generation",
        position: { x: 260, y: 0 },
        data: { provider: "opencode", prompt },
        dslKind: "opencode_callback"
      }
    ];

    return {
      name: workflowName(prompt),
      graph: buildGraph(steps),
      dsl: buildDsl(steps),
      nodeMap: Object.fromEntries(steps.map((step) => [step.taskName, step.nodeId]))
    };
  }
}

function buildGraph(steps: WorkflowStep[]): WorkflowGraph {
  const nodes: WorkflowNode[] = steps.map((step) => ({
    id: step.nodeId,
    type: step.nodeType,
    position: step.position,
    data: step.data
  }));

  return {
    nodes,
    edges: [
      {
        id: "edge_parse_request_run_opencode",
        source: "node_parse_request",
        target: "node_run_opencode"
      }
    ]
  };
}

function buildDsl(steps: WorkflowStep[]): string {
  const lines: string[] = [];

  for (const step of steps) {
    if (step.dslKind === "eval_prompt") {
      lines.push(`${step.taskName} = EVAL {`);
      lines.push("    input.prompt");
      lines.push("}");
      lines.push("");
      continue;
    }

    lines.push(`${step.taskName} = HTTP {`);
    lines.push('    method = "POST"');
    lines.push('    url = input.apiBaseUrl + "/internal/agent-runs"');
    lines.push("    json([");
    lines.push("        projectId: input.projectId,");
    lines.push("        workflowRunId: input.workflowRunId,");
    lines.push("        conversationId: input.conversationId,");
    lines.push(`        nodeId: "${escapeGroovyString(step.nodeId)}",`);
    lines.push("        prompt: input.prompt");
    lines.push("    ])");
    lines.push("}");
    lines.push("");
  }

  lines.push("start {");
  for (const step of steps) {
    lines.push(`    run ${step.taskName}`);
  }
  lines.push("}");

  return lines.join("\n");
}

function workflowName(prompt: string): string {
  const collapsed = prompt.replace(/\s+/g, " ").trim();
  const summary = collapsed.length > 80 ? `${collapsed.slice(0, 77)}...` : collapsed;
  return `Generated: ${summary}`;
}

function escapeGroovyString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}