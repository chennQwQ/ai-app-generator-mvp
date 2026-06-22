import { existsSync } from "node:fs";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import type { PreviewInfo } from "@ai-app-generator/shared";
import type { AppConfig } from "../config.js";
import type { EventBus } from "../events/event-bus.js";

export interface PreviewCommand {
  command: string;
  args: string[];
}

export type PreviewCommandFactory = (port: number) => PreviewCommand;
export type PreviewCommandSource = PreviewCommand | PreviewCommandFactory;

export interface PreviewCommandPlan {
  install?: PreviewCommandSource;
  dev: PreviewCommandSource;
}

export type PreviewCommandProvider = PreviewCommandSource | PreviewCommandPlan;

interface ActivePreview {
  process: ChildProcessWithoutNullStreams;
  info: PreviewInfo;
}

const stoppedPreview: PreviewInfo = { status: "stopped", port: null, url: null };

export class PreviewManager {
  private readonly previews = new Map<string, ActivePreview>();
  private nextPort: number;

  constructor(
    private readonly config: AppConfig,
    private readonly bus: EventBus,
    commandProvider: PreviewCommandProvider = {
      install: { command: "npm", args: ["install"] },
      dev: (port) => ({
        command: "npm",
        args: ["run", "dev", "--", "--host", config.previewHost, "--port", String(port)]
      })
    }
  ) {
    this.nextPort = config.previewPortStart;
    this.commandPlan = normalizeCommandProvider(commandProvider);
  }

  private readonly commandPlan: ResolvedPreviewCommandPlan;

  buildUrl(port: number): string {
    return `http://${this.config.previewHost}:${port}`;
  }

  start(projectId: string, workspacePath: string): PreviewInfo {
    if (this.previews.has(projectId)) this.stop(projectId);

    const port = this.nextPort;
    this.nextPort += 1;
    const preview: PreviewInfo = {
      status: this.commandPlan.install ? "starting" : "running",
      port,
      url: this.buildUrl(port)
    };
    const installCommand = this.commandPlan.install?.(port);

    if (installCommand) {
      const installProcess = spawnPreview(installCommand.command, installCommand.args, workspacePath);
      this.previews.set(projectId, { process: installProcess, info: preview });
      this.attachInstallHandlers({
        projectId,
        workspacePath,
        port,
        child: installProcess,
        preview
      });
      this.bus.publish({ type: "preview.status", projectId, preview });
      return preview;
    }

    const devPreview = { ...preview, status: "running" as const };
    const devProcess = this.spawnDevProcess(projectId, workspacePath, port, devPreview);
    this.previews.set(projectId, { process: devProcess, info: devPreview });

    this.bus.publish({ type: "preview.status", projectId, preview: devPreview });
    return devPreview;
  }

  stop(projectId: string): PreviewInfo {
    const active = this.previews.get(projectId);
    if (active) {
      this.previews.delete(projectId);
      killPreview(active.process);
      this.bus.publish({ type: "preview.status", projectId, preview: stoppedPreview });
    }
    return stoppedPreview;
  }

  stopAll(): void {
    for (const projectId of [...this.previews.keys()]) {
      this.stop(projectId);
    }
  }

  private spawnDevProcess(
    projectId: string,
    workspacePath: string,
    port: number,
    preview: PreviewInfo
  ): ChildProcessWithoutNullStreams {
    const command = this.commandPlan.dev(port);
    const child = spawnPreview(command.command, command.args, workspacePath);
    this.attachDevHandlers(projectId, child, preview);
    return child;
  }

  private finishInstallAndStartDev(
    projectId: string,
    workspacePath: string,
    port: number,
    installProcess: ChildProcessWithoutNullStreams,
    preview: PreviewInfo
  ): void {
    const active = this.previews.get(projectId);
    if (!active || active.process !== installProcess) return;

    const runningPreview: PreviewInfo = { ...preview, status: "running" };
    const devProcess = this.spawnDevProcess(projectId, workspacePath, port, runningPreview);
    this.previews.set(projectId, { process: devProcess, info: runningPreview });
    this.bus.publish({ type: "preview.status", projectId, preview: runningPreview });
  }

  private markPreviewError(
    projectId: string,
    child: ChildProcessWithoutNullStreams,
    preview: PreviewInfo
  ): void {
    const active = this.previews.get(projectId);
    if (!active || active.process !== child) return;

    this.previews.delete(projectId);
    const errorPreview: PreviewInfo = { ...preview, status: "error" };
    this.bus.publish({ type: "preview.status", projectId, preview: errorPreview });
  }

  private attachInstallHandlers(options: InstallHandlerOptions): void {
    options.child.on("error", () => {
      this.markPreviewError(options.projectId, options.child, options.preview);
    });
    options.child.on("close", (code) => {
      if (code === 0) {
        this.finishInstallAndStartDev(
          options.projectId,
          options.workspacePath,
          options.port,
          options.child,
          options.preview
        );
        return;
      }

      this.markPreviewError(options.projectId, options.child, options.preview);
    });
  }

  private attachDevHandlers(
    projectId: string,
    child: ChildProcessWithoutNullStreams,
    preview: PreviewInfo
  ): void {
    child.on("error", () => {
      this.markPreviewError(projectId, child, preview);
    });
    child.on("close", () => {
      this.markPreviewError(projectId, child, preview);
    });
  }
}

interface ResolvedPreviewCommandPlan {
  install?: PreviewCommandFactory;
  dev: PreviewCommandFactory;
}

interface InstallHandlerOptions {
  projectId: string;
  workspacePath: string;
  port: number;
  child: ChildProcessWithoutNullStreams;
  preview: PreviewInfo;
}

function normalizeCommandProvider(commandProvider: PreviewCommandProvider): ResolvedPreviewCommandPlan {
  if (isCommandPlan(commandProvider)) {
    return {
      install: commandProvider.install ? toCommandFactory(commandProvider.install) : undefined,
      dev: toCommandFactory(commandProvider.dev)
    };
  }

  return { dev: toCommandFactory(commandProvider) };
}

function toCommandFactory(commandSource: PreviewCommandSource): PreviewCommandFactory {
  return typeof commandSource === "function" ? commandSource : () => commandSource;
}

function isCommandPlan(commandProvider: PreviewCommandProvider): commandProvider is PreviewCommandPlan {
  return typeof commandProvider === "object" && "dev" in commandProvider;
}

function spawnPreview(
  commandName: string,
  args: string[],
  workspacePath: string
): ChildProcessWithoutNullStreams {
  const resolvedCommand =
    process.platform === "win32" ? resolveWindowsCommand(commandName, workspacePath) : commandName;

  if (process.platform === "win32" && isWindowsCommandShim(resolvedCommand)) {
    return spawn(
      process.env.ComSpec ?? "cmd.exe",
      ["/d", "/s", "/c", buildWindowsShimCommand(resolvedCommand, args)],
      {
        cwd: workspacePath,
        windowsHide: true,
        windowsVerbatimArguments: true
      }
    );
  }

  return spawn(resolvedCommand, args, {
    cwd: workspacePath,
    detached: process.platform !== "win32",
    windowsHide: true
  });
}

function killPreview(child: ChildProcessWithoutNullStreams): void {
  if (child.killed) return;
  if (process.platform === "win32" && child.pid) {
    spawnSync("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true
    });
  }

  if (process.platform !== "win32" && child.pid) {
    try {
      process.kill(-child.pid, "SIGTERM");
      return;
    } catch (error) {
      if (!isMissingProcessError(error)) throw error;
    }
  }

  child.kill();
}

function isMissingProcessError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ESRCH";
}

function resolveWindowsCommand(commandName: string, workspacePath: string): string {
  if (path.extname(commandName)) return commandName;

  for (const candidate of getWindowsCommandCandidates(commandName, workspacePath)) {
    if (existsSync(candidate)) return candidate;
  }

  return commandName;
}

function getWindowsCommandCandidates(commandName: string, workspacePath: string): string[] {
  const extensions = getWindowsPathExtensions();
  if (hasPathSeparator(commandName)) {
    const basePath = path.resolve(workspacePath, commandName);
    return extensions.map((extension) => `${basePath}${extension}`);
  }

  return getWindowsPathDirectories().flatMap((directory) =>
    extensions.map((extension) => path.join(directory, `${commandName}${extension}`))
  );
}

function getWindowsPathExtensions(): string[] {
  const extensions = (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map((extension) => extension.trim())
    .filter(Boolean);
  return extensions.length > 0 ? extensions : [".COM", ".EXE", ".BAT", ".CMD"];
}

function getWindowsPathDirectories(): string[] {
  return (process.env.PATH ?? "")
    .split(path.delimiter)
    .map((directory) => directory.trim())
    .filter(Boolean);
}

function hasPathSeparator(value: string): boolean {
  return value.includes("/") || value.includes("\\");
}

function isWindowsCommandShim(commandName: string): boolean {
  const extension = path.extname(commandName).toLowerCase();
  return extension === ".cmd" || extension === ".bat";
}

function buildWindowsShimCommand(commandName: string, args: string[]): string {
  const command = [commandName, ...args].map(quoteWindowsCommandArgument).join(" ");
  return `"${command}"`;
}

function quoteWindowsCommandArgument(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
