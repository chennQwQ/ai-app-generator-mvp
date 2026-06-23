import type {
  AgentLog,
  AgentRun,
  ChatMessage,
  DeploymentInfo,
  FileNode,
  PreviewInfo,
  ProjectSummary,
  TemplateMeta,
  WorkflowDetail,
  WorkflowGraph,
  WorkflowRun,
  WorkflowSummary
} from "@ai-app-generator/shared";

export const apiBase = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:4317";
export const wsBase = apiBase.replace(/^http:/, "ws:").replace(/^https:/, "wss:");

export interface SendMessageResponse {
  message: ChatMessage;
  run: AgentRun;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  return request<ProjectSummary[]>("/api/projects");
}

export async function listTemplates(): Promise<TemplateMeta[]> {
  return request<TemplateMeta[]>("/api/templates");
}

export async function createProject(name: string, template?: string): Promise<ProjectSummary> {
  return request<ProjectSummary>("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name, template })
  });
}

export async function listMessages(projectId: string): Promise<ChatMessage[]> {
  return request<ChatMessage[]>(`/api/projects/${encodeURIComponent(projectId)}/messages`);
}

export async function sendMessage(
  projectId: string,
  content: string
): Promise<SendMessageResponse> {
  return request<SendMessageResponse>(`/api/projects/${encodeURIComponent(projectId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ content })
  });
}

export async function getFiles(projectId: string): Promise<FileNode[]> {
  return request<FileNode[]>(`/api/projects/${encodeURIComponent(projectId)}/files`);
}

export async function getFileContent(projectId: string, path: string): Promise<string> {
  const params = new URLSearchParams({ path });
  const result = await request<{ content: string }>(
    `/api/projects/${encodeURIComponent(projectId)}/files/content?${params.toString()}`
  );
  return result.content;
}

export async function startPreview(projectId: string): Promise<PreviewInfo> {
  return request<PreviewInfo>(`/api/projects/${encodeURIComponent(projectId)}/preview/start`, {
    method: "POST"
  });
}

export async function stopPreview(projectId: string): Promise<PreviewInfo> {
  return request<PreviewInfo>(`/api/projects/${encodeURIComponent(projectId)}/preview/stop`, {
    method: "POST"
  });
}

export async function listAgentRuns(projectId: string): Promise<AgentRun[]> {
  return request<AgentRun[]>(`/api/projects/${encodeURIComponent(projectId)}/runs`);
}

export async function getRunLogs(projectId: string, runId: string): Promise<AgentLog[]> {
  return request<AgentLog[]>(
    `/api/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/logs`
  );
}

export async function cancelRun(projectId: string, runId: string): Promise<{ run: AgentRun }> {
  return request<{ run: AgentRun }>(
    `/api/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/cancel`,
    { method: "POST" }
  );
}

export async function deleteProject(projectId: string): Promise<void> {
  await request<{ ok: boolean }>(
    `/api/projects/${encodeURIComponent(projectId)}`,
    { method: "DELETE" }
  );
}

export async function listWorkflows(projectId: string): Promise<WorkflowSummary[]> {
  return request<WorkflowSummary[]>(
    `/api/projects/${encodeURIComponent(projectId)}/workflows`
  );
}

export async function createWorkflow(projectId: string, name: string): Promise<WorkflowDetail> {
  return request<WorkflowDetail>(
    `/api/projects/${encodeURIComponent(projectId)}/workflows`,
    { method: "POST", body: JSON.stringify({ name }) }
  );
}

export async function getWorkflow(projectId: string, workflowId: string): Promise<WorkflowDetail> {
  return request<WorkflowDetail>(
    `/api/projects/${encodeURIComponent(projectId)}/workflows/${encodeURIComponent(workflowId)}`
  );
}

export async function updateWorkflowGraph(
  projectId: string,
  workflowId: string,
  graph: WorkflowGraph
): Promise<WorkflowDetail> {
  return request<WorkflowDetail>(
    `/api/projects/${encodeURIComponent(projectId)}/workflows/${encodeURIComponent(workflowId)}`,
    { method: "PUT", body: JSON.stringify({ graph }) }
  );
}

export async function deleteWorkflow(projectId: string, workflowId: string): Promise<void> {
  await request<{ ok: boolean }>(
    `/api/projects/${encodeURIComponent(projectId)}/workflows/${encodeURIComponent(workflowId)}`,
    { method: "DELETE" }
  );
}

export async function runWorkflow(projectId: string, workflowId: string): Promise<WorkflowRun> {
  return request<WorkflowRun>(
    `/api/projects/${encodeURIComponent(projectId)}/workflows/${encodeURIComponent(workflowId)}/run`,
    { method: "POST" }
  );
}

export async function deployProject(projectId: string): Promise<DeploymentInfo> {
  return request<DeploymentInfo>(
    `/api/projects/${encodeURIComponent(projectId)}/deploy`,
    { method: "POST" }
  );
}

export async function getDeploymentStatus(projectId: string): Promise<DeploymentInfo> {
  return request<DeploymentInfo>(
    `/api/projects/${encodeURIComponent(projectId)}/deploy`
  );
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = init.body
    ? {
        "Content-Type": "application/json",
        ...init.headers
      }
    : init.headers;

  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as T;
}
