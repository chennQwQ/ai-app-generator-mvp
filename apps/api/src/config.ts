import path from "node:path";

export interface AppConfig {
  appRoot: string;
  apiHost: string;
  apiPort: number;
  webOrigin: string;
  storageDir: string;
  workspaceDir: string;
  templateDir: string;
  templatesDir: string;
  agentProvider: "fake" | "opencode";
  opencodeCommand: string;
  opencodeAgent: string;
  opencodeRunFormat: "json";
  previewHost: string;
  previewPortStart: number;
}

export interface LoadConfigOptions {
  cwd?: string;
}

function resolveAppRoot(env: NodeJS.ProcessEnv, cwd: string): string {
  if (env.APP_ROOT) {
    return path.resolve(cwd, env.APP_ROOT);
  }

  return path.basename(cwd) === "api" ? path.resolve(cwd, "../..") : cwd;
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  options: LoadConfigOptions = {}
): AppConfig {
  const cwd = options.cwd ?? process.cwd();
  const appRoot = resolveAppRoot(env, cwd);
  return {
    appRoot,
    apiHost: env.API_HOST ?? "127.0.0.1",
    apiPort: Number(env.API_PORT ?? 4317),
    webOrigin: env.WEB_ORIGIN ?? "http://127.0.0.1:5173",
    storageDir: path.resolve(appRoot, env.STORAGE_DIR ?? "./storage"),
    workspaceDir: path.resolve(appRoot, env.WORKSPACE_DIR ?? "./workspaces"),
    templateDir: path.resolve(appRoot, env.TEMPLATE_DIR ?? "./templates/react-vite"),
    templatesDir: path.resolve(appRoot, env.TEMPLATES_DIR ?? "./templates"),
    agentProvider: env.AGENT_PROVIDER === "opencode" ? "opencode" : "fake",
    opencodeCommand: env.OPENCODE_COMMAND ?? "opencode",
    opencodeAgent: env.OPENCODE_AGENT ?? "build",
    opencodeRunFormat: "json",
    previewHost: env.PREVIEW_HOST ?? "127.0.0.1",
    previewPortStart: Number(env.PREVIEW_PORT_START ?? 6200)
  };
}
