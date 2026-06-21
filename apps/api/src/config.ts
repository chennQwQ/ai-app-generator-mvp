import path from "node:path";

export interface AppConfig {
  apiHost: string;
  apiPort: number;
  webOrigin: string;
  storageDir: string;
  workspaceDir: string;
  templateDir: string;
  agentProvider: "fake" | "opencode";
  opencodeCommand: string;
  opencodeAgent: string;
  opencodeRunFormat: "json";
  previewHost: string;
  previewPortStart: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const cwd = process.cwd();
  return {
    apiHost: env.API_HOST ?? "127.0.0.1",
    apiPort: Number(env.API_PORT ?? 4317),
    webOrigin: env.WEB_ORIGIN ?? "http://127.0.0.1:5173",
    storageDir: path.resolve(cwd, env.STORAGE_DIR ?? "./storage"),
    workspaceDir: path.resolve(cwd, env.WORKSPACE_DIR ?? "./workspaces"),
    templateDir: path.resolve(cwd, env.TEMPLATE_DIR ?? "./templates/react-vite"),
    agentProvider: env.AGENT_PROVIDER === "opencode" ? "opencode" : "fake",
    opencodeCommand: env.OPENCODE_COMMAND ?? "opencode",
    opencodeAgent: env.OPENCODE_AGENT ?? "build",
    opencodeRunFormat: "json",
    previewHost: env.PREVIEW_HOST ?? "127.0.0.1",
    previewPortStart: Number(env.PREVIEW_PORT_START ?? 6200)
  };
}
