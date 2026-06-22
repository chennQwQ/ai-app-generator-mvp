import { existsSync } from "node:fs";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import type { PreviewInfo } from "@ai-app-generator/shared";
import type { AppConfig } from "../config.js";
import type { EventBus } from "../events/event-bus.js";

export interface PreviewCommand {
  command: string;
  args: string[];
}

export type PreviewCommandFactory = (port: number) => PreviewCommand;
export type PreviewCommandProvider = PreviewCommand | PreviewCommandFactory;

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
    commandProvider: PreviewCommandProvider = (port) => ({
      command: "npm",
      args: ["run", "dev", "--", "--host", config.previewHost, "--port", String(port)]
    })
  ) {
    this.nextPort = config.previewPortStart;
    this.commandFactory =
      typeof commandProvider === "function" ? commandProvider : () => commandProvider;
  }

  private readonly commandFactory: PreviewCommandFactory;

  buildUrl(port: number): string {
    return `http://${this.config.previewHost}:${port}`;
  }

  start(projectId: string, workspacePath: string): PreviewInfo {
    if (this.previews.has(projectId)) this.stop(projectId);

    const port = this.nextPort;
    this.nextPort += 1;
    const command = this.commandFactory(port);
    const child = spawnPreview(command.command, command.args, workspacePath);
    const preview: PreviewInfo = {
      status: "running",
      port,
      url: this.buildUrl(port)
    };

    this.previews.set(projectId, { process: child, info: preview });
    this.bus.publish({ type: "preview.status", projectId, preview });
    return preview;
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
    windowsHide: true
  });
}

function killPreview(child: ChildProcessWithoutNullStreams): void {
  if (child.killed) return;
  if (process.platform === "win32" && child.pid) {
    const killer = spawn("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true
    });
    killer.unref();
  }
  child.kill();
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
