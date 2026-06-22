import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { AgentLogStream } from "@ai-app-generator/shared";
import type { AppConfig } from "../config.js";
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
}

export class FakeAgentRunner implements AgentRunner {
  readonly command = "fake";

  constructor(_config: AppConfig, _bus: EventBus) {}

  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    emitLog(request, "event", "Fake agent started");

    const srcDir = path.join(request.workspacePath, "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(path.join(srcDir, "App.tsx"), renderFakeApp(request.prompt), "utf8");

    emitLog(request, "event", "Fake agent wrote src/App.tsx");
    emitLog(request, "event", "Fake agent completed");
    return { exitCode: 0, errorMessage: null };
  }
}

export class OpenCodeAgentRunner implements AgentRunner {
  readonly command: string;
  private readonly commandName: string;
  private readonly commandArgs: string[];

  constructor(private readonly config: AppConfig, _bus: EventBus) {
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
        request.prompt
      ];

      const child = spawn(this.commandName, args, {
        cwd: request.workspacePath,
        shell: process.platform === "win32",
        windowsHide: true
      });

      let settled = false;
      const settle = (result: AgentRunResult) => {
        if (settled) return;
        settled = true;
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
}

export function createAgentRunner(config: AppConfig, bus: EventBus): AgentRunner {
  return config.agentProvider === "opencode"
    ? new OpenCodeAgentRunner(config, bus)
    : new FakeAgentRunner(config, bus);
}

function renderFakeApp(prompt: string): string {
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

function splitCommand(command: string): string[] {
  const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  return parts.map((part) => part.replace(/^"|"$/g, ""));
}
