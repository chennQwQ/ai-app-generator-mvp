export type ProjectStatus = "created" | "generating" | "ready" | "error";
export type PreviewStatus = "stopped" | "starting" | "running" | "error";
export type MessageRole = "user" | "assistant" | "system";
export type AgentRunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type AgentLogStream = "stdout" | "stderr" | "event";

export interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  status: ProjectStatus;
  previewStatus: PreviewStatus;
  previewPort: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  agentRunId: string | null;
  createdAt: string;
}

export interface AgentRun {
  id: string;
  projectId: string;
  conversationId: string;
  status: AgentRunStatus;
  prompt: string;
  command: string;
  exitCode: number | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface AgentLog {
  id: string;
  agentRunId: string;
  stream: AgentLogStream;
  content: string;
  sequence: number;
  createdAt: string;
}

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

export interface PreviewInfo {
  status: PreviewStatus;
  port: number | null;
  url: string | null;
  output?: string;
}

export const projectEventTypes = [
  "run.status",
  "run.log",
  "files.changed",
  "preview.status",
  "error"
] as const;

export type ProjectEventType = (typeof projectEventTypes)[number];

export type ProjectEvent =
  | { type: "run.status"; projectId: string; run: AgentRun }
  | { type: "run.log"; projectId: string; log: AgentLog }
  | { type: "files.changed"; projectId: string }
  | { type: "preview.status"; projectId: string; preview: PreviewInfo }
  | { type: "error"; projectId: string; message: string };

export function isTerminalRunStatus(status: AgentRunStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}
