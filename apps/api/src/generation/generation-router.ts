export type GenerationRoute =
  | "create_app_from_prompt"
  | "modify_app_from_prompt"
  | "run_existing_workflow"
  | "preview_project"
  | "chat_only";

export interface GenerationRouteInput {
  prompt: string;
  hasExistingProjectFiles?: boolean;
  requestedWorkflowId?: string | null;
}

export interface GenerationRouteDecision {
  route: GenerationRoute;
  reason: string;
}

export class GenerationRoutingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationRoutingError";
  }
}

export class GenerationRouter {
  route(input: GenerationRouteInput): GenerationRouteDecision {
    const prompt = input.prompt.trim();
    if (!prompt) throw new GenerationRoutingError("Generation prompt is required");

    const normalized = prompt.toLowerCase();

    if (input.requestedWorkflowId || mentionsExistingWorkflowRun(normalized)) {
      return { route: "run_existing_workflow", reason: "prompt asks to run an existing workflow" };
    }

    if (mentionsPreview(normalized)) {
      return { route: "preview_project", reason: "prompt asks for preview state" };
    }

    if (looksLikeChatOnly(normalized)) {
      return { route: "chat_only", reason: "prompt is conversational and does not request generation" };
    }

    if (input.hasExistingProjectFiles || mentionsModification(normalized)) {
      return { route: "modify_app_from_prompt", reason: "prompt asks to modify an existing app" };
    }

    return { route: "create_app_from_prompt", reason: "prompt asks to create an app" };
  }
}

function mentionsExistingWorkflowRun(prompt: string): boolean {
  return (
    /\b(run|execute|start)\b.*\b(workflow|flow)\b/.test(prompt) ||
    /(运行|执行|启动).*(工作流|流程)/.test(prompt)
  );
}

function mentionsPreview(prompt: string): boolean {
  return /\bpreview\b/.test(prompt) || /(预览|查看效果|打开预览)/.test(prompt);
}

function mentionsModification(prompt: string): boolean {
  return (
    /\b(modify|change|update|add|fix|adjust|improve|refactor)\b/.test(prompt) ||
    /(修改|调整|更新|增加|添加|修复|优化|重构)/.test(prompt)
  );
}

function looksLikeChatOnly(prompt: string): boolean {
  return /^(hi|hello|thanks|thank you|ok|okay)[.!?\s]*$/.test(prompt) || /^(你好|谢谢|好的|可以)[。！!\s]*$/.test(prompt);
}