import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { AgentLogStream } from "@ai-app-generator/shared";
import type { AppConfig } from "../config.js";
import type { AuditService } from "../audit/audit-service.js";
import type { EventBus } from "../events/event-bus.js";

export interface AgentRunRequest {
  projectId: string;
  runId: string;
  workspacePath: string;
  prompt: string;
  onLog?: (stream: AgentLogStream, content: string) => void;
}

export interface AgentRunResult {
  exitCode: number;
  errorMessage: string | null;
}

export interface AgentRunner {
  readonly command: string;
  run(request: AgentRunRequest): Promise<AgentRunResult>;
  cancel(runId: string): void;
  healthCheck(): Promise<{ ok: boolean; reason?: string }>;
}

export class FakeAgentRunner implements AgentRunner {
  readonly command = "fake";
  private readonly controllers = new Map<string, AbortController>();

  constructor(_config: AppConfig, _bus: EventBus, private readonly audit?: AuditService) {}

  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    const controller = new AbortController();
    this.controllers.set(request.runId, controller);

    await delay(0);

    if (controller.signal.aborted) {
      this.controllers.delete(request.runId);
      return { exitCode: 1, errorMessage: "Cancelled" };
    }

    emitLog(request, "event", "Fake agent started");

    const srcDir = path.join(request.workspacePath, "src");
    mkdirSync(srcDir, { recursive: true });
    const target = resolveFakeAppTarget(request.workspacePath);
    const content = target.kind === "vue" ? renderFakeVueApp(request.prompt) : renderFakeReactApp(request.prompt);
    writeFileSync(path.join(request.workspacePath, target.path), content, "utf8");

    this.audit?.recordLog({
      projectId: request.projectId,
      runId: request.runId,
      toolName: "file_write",
      parameters: { path: target.path, content },
      exitCode: 0
    });

    emitLog(request, "event", `Fake agent wrote ${target.path}`);

    if (controller.signal.aborted) {
      this.controllers.delete(request.runId);
      return { exitCode: 1, errorMessage: "Cancelled" };
    }

    emitLog(request, "event", "Fake agent completed");
    this.controllers.delete(request.runId);
    return { exitCode: 0, errorMessage: null };
  }

  cancel(runId: string): void {
    const controller = this.controllers.get(runId);
    if (controller) controller.abort();
  }

  async healthCheck(): Promise<{ ok: boolean }> {
    return { ok: true };
  }
}

export class OpenCodeAgentRunner implements AgentRunner {
  readonly command: string;
  private readonly commandName: string;
  private readonly commandArgs: string[];
  private readonly processes = new Map<string, ReturnType<typeof spawnOpenCode>>();

  constructor(private readonly config: AppConfig, _bus: EventBus, private readonly audit?: AuditService) {
    const commandParts = splitCommand(config.opencodeCommand);
    this.commandName = commandParts[0] ?? config.opencodeCommand;
    this.commandArgs = commandParts.slice(1);
    this.command = [
      ...commandParts,
      "run",
      "--agent",
      config.opencodeAgent,
      "--format",
      config.opencodeRunFormat
    ].join(" ");
  }

  run(request: AgentRunRequest): Promise<AgentRunResult> {
    return new Promise((resolve) => {
      const args = [
        ...this.commandArgs,
        "run",
        "--agent",
        this.config.opencodeAgent,
        "--format",
        this.config.opencodeRunFormat,
        "--dir",
        request.workspacePath,
        request.prompt
      ];

      this.audit?.recordLog({
        projectId: request.projectId,
        runId: request.runId,
        toolName: "shell",
        parameters: { command: `${this.config.opencodeCommand} run --agent ${this.config.opencodeAgent} ...` },
        exitCode: undefined
      });

      const child = spawnOpenCode(this.commandName, args, request.workspacePath);
      this.processes.set(request.runId, child);

      let settled = false;
      const settle = (result: AgentRunResult) => {
        if (settled) return;
        settled = true;
        this.processes.delete(request.runId);
        resolve(result);
      };

      child.stdout.on("data", (chunk: Buffer) => {
        emitLog(request, "stdout", chunk.toString());
      });
      child.stderr.on("data", (chunk: Buffer) => {
        emitLog(request, "stderr", chunk.toString());
      });
      child.on("error", (error) => {
        emitLog(request, "stderr", error.message);
        settle({ exitCode: 1, errorMessage: error.message });
      });
      child.on("close", (code) => {
        const exitCode = code ?? 1;
        settle({
          exitCode,
          errorMessage: exitCode === 0 ? null : `OpenCode exited with code ${exitCode}`
        });
      });
    });
  }

  cancel(runId: string): void {
    const child = this.processes.get(runId);
    if (child) killAgentProcess(child);
  }

  async healthCheck(): Promise<{ ok: boolean; reason?: string }> {
    return new Promise((resolve) => {
      try {
        const child = spawnOpenCode(this.commandName, [...this.commandArgs, "--version"], this.config.appRoot);
        let settled = false;
        let timeout: ReturnType<typeof setTimeout>;
        const settle = (result: { ok: boolean; reason?: string }) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve(result);
        };
        timeout = setTimeout(() => {
          killAgentProcess(child);
          settle({ ok: false, reason: "Timed out" });
        }, 5000);

        child.on("error", (error) => {
          settle({ ok: false, reason: error.message });
        });
        child.on("close", (code) => {
          settle(code === 0 ? { ok: true } : { ok: false, reason: `Exited with code ${code}` });
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        resolve({ ok: false, reason: message });
      }
    });
  }
}

export function createAgentRunner(config: AppConfig, bus: EventBus, audit?: AuditService): AgentRunner {
  return config.agentProvider === "opencode"
    ? new OpenCodeAgentRunner(config, bus, audit)
    : new FakeAgentRunner(config, bus, audit);
}

function resolveFakeAppTarget(workspacePath: string): { path: string; kind: "react" | "vue" } {
  if (existsSync(path.join(workspacePath, "src", "App.vue"))) {
    return { path: "src/App.vue", kind: "vue" };
  }

  return readProjectTemplate(workspacePath) === "vue-vite"
    ? { path: "src/App.vue", kind: "vue" }
    : { path: "src/App.tsx", kind: "react" };
}

function readProjectTemplate(workspacePath: string): string | null {
  try {
    return readFileSync(path.join(workspacePath, ".ai-template"), "utf8").trim();
  } catch {
    return null;
  }
}

function renderFakeReactApp(prompt: string): string {
  return `const prompt = ${tsxStringLiteral(prompt)};

export default function App() {
  return (
    <main>
      <h1>Generated App</h1>
      <p>{prompt}</p>
    </main>
  );
}
`;
}

function renderFakeVueApp(prompt: string): string {
  return `<script setup lang="ts">
const prompt = ${tsxStringLiteral(prompt)};
</script>

<template>
  <main>
    <h1>Generated App</h1>
    <p>{{ prompt }}</p>
  </main>
</template>
`;
}

function tsxStringLiteral(value: string): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function emitLog(request: AgentRunRequest, stream: AgentLogStream, content: string): void {
  try {
    request.onLog?.(stream, content);
  } catch {
    // Log sinks are best-effort; runner execution should not fail because a subscriber failed.
  }
}

function spawnOpenCode(
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

function killAgentProcess(child: ChildProcessWithoutNullStreams): void {
  if (child.killed) return;

  if (process.platform === "win32" && child.pid) {
    spawnSync("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true
    });
    return;
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function splitCommand(command: string): string[] {
  const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  return parts.map((part) => part.replace(/^"|"$/g, ""));
}
