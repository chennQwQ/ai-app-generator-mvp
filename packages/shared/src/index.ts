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
  previewUrl: string | null;
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

export interface TemplateMeta {
  id: string;
  name: string;
  description: string;
}

export interface ToolParameter {
  name: string;
  type: "string" | "number" | "boolean";
  description: string;
  required?: boolean;
  default?: string | number | boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
}

export const toolDefinitions: ToolDefinition[] = [
  {
    name: "shell",
    description: "Execute a shell command inside the workspace",
    parameters: [
      { name: "command", type: "string", description: "The shell command to execute", required: true },
      { name: "cwd", type: "string", description: "Working directory relative to workspace root" }
    ]
  },
  {
    name: "file_write",
    description: "Write content to a file in the workspace",
    parameters: [
      { name: "path", type: "string", description: "File path relative to workspace root", required: true },
      { name: "content", type: "string", description: "File content", required: true }
    ]
  },
  {
    name: "npm_install",
    description: "Install npm dependencies in the workspace",
    parameters: [
      { name: "packages", type: "string", description: "Space-separated package names to install" },
      { name: "dev", type: "boolean", description: "Install as devDependency", default: false }
    ]
  },
  {
    name: "npm_build",
    description: "Run the project build script",
    parameters: [
      { name: "script", type: "string", description: "The npm script name", default: "build" }
    ]
  }
];

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return toolDefinitions.find((t) => t.name === name);
}

export interface AuditLog {
  id: string;
  projectId: string;
  runId: string;
  toolName: string;
  parameters: Record<string, unknown>;
  exitCode: number | null;
  output: string | null;
  createdAt: string;
}
