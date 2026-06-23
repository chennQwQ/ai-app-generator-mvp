import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AppConfig } from "../src/config.js";
import { FakeAgentRunner, OpenCodeAgentRunner } from "../src/agent/agent-runner.js";
import { EventBus } from "../src/events/event-bus.js";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe("EventBus", () => {
  it("stops delivering project events after unsubscribe", () => {
    const bus = new EventBus();
    const events: string[] = [];
    const unsubscribe = bus.subscribe("project-1", (event) => events.push(event.type));

    bus.publish({ type: "files.changed", projectId: "project-1" });
    unsubscribe();
    bus.publish({ type: "files.changed", projectId: "project-1" });
    bus.publish({ type: "files.changed", projectId: "project-2" });

    expect(events).toEqual(["files.changed"]);
  });

  it("isolates listener exceptions and continues delivering project events", () => {
    const bus = new EventBus();
    const events: string[] = [];
    bus.subscribe("project-1", () => {
      throw new Error("listener failed");
    });
    bus.subscribe("project-1", (event) => events.push(event.type));

    expect(() => bus.publish({ type: "files.changed", projectId: "project-1" })).not.toThrow();
    expect(events).toEqual(["files.changed"]);
  });
});

describe("FakeAgentRunner", () => {
  it("emits logs and writes valid TSX for prompts with JSX-sensitive characters", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-agent-"));
    const bus = new EventBus();
    const runner = new FakeAgentRunner(fakeConfig(tempDir), bus);
    const logs: string[] = [];

    const result = await runner.run({
      projectId: "project-1",
      runId: "run-1",
      workspacePath: tempDir,
      prompt: "Build `<Todo />` with ${state}, braces { ok }, and \"quotes\"",
      onLog: (_stream, content) => logs.push(content)
    });

    expect(result).toEqual({ exitCode: 0, errorMessage: null });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.join("\n")).toContain("Fake agent");

    const appPath = path.join(tempDir, "src", "App.tsx");
    expect(existsSync(appPath)).toBe(true);
    const appSource = readFileSync(appPath, "utf8");
    expect(appSource).toContain("const prompt =");
    expect(appSource).toContain("{prompt}");
    expect(appSource).not.toContain("<Todo />");
  });

  it("writes Vue output for an empty workspace with a Vue template marker", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-agent-vue-"));
    writeFileSync(path.join(tempDir, ".ai-template"), "vue-vite\n");
    const runner = new FakeAgentRunner(fakeConfig(tempDir), new EventBus());

    const result = await runner.run({
      projectId: "project-1",
      runId: "run-1",
      workspacePath: tempDir,
      prompt: "Build Vue app"
    });

    expect(result).toEqual({ exitCode: 0, errorMessage: null });
    expect(existsSync(path.join(tempDir, "src", "App.vue"))).toBe(true);
    expect(existsSync(path.join(tempDir, "src", "App.tsx"))).toBe(false);
    const appSource = readFileSync(path.join(tempDir, "src", "App.vue"), "utf8");
    expect(appSource).toContain("Build Vue app");
  });
});

describe("OpenCodeAgentRunner", () => {
  it.skipIf(process.platform !== "win32")("runs a Windows .cmd shim without shell-injecting the prompt", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-opencode-"));
    const workspacePath = path.join(tempDir, "workspace");
    mkdirSync(workspacePath);
    const commandPath = path.join(tempDir, "opencode.cmd");
    const cliPath = path.join(tempDir, "opencode-shim-target.cjs");
    const recordPath = path.join(tempDir, "argv.txt");
    writeFileSync(
      cliPath,
      [
        "const fs = require('node:fs');",
        `fs.writeFileSync(${JSON.stringify(recordPath)}, JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2) }));`,
        "console.log('shim stdout');"
      ].join("\n"),
      "utf8"
    );
    writeFileSync(
      commandPath,
      ["@echo off", `node "${cliPath}" %*`].join("\r\n"),
      "utf8"
    );
    const prompt = "Build from shim \" & echo INJECTED_STDOUT | more < input > output";
    const runner = new OpenCodeAgentRunner(
      {
        ...fakeConfig(tempDir),
        agentProvider: "opencode",
        opencodeCommand: `"${commandPath}" --shim-flag`
      },
      new EventBus()
    );
    const logs: string[] = [];

    const result = await runner.run({
      projectId: "project-1",
      runId: "run-1",
      workspacePath,
      prompt,
      onLog: (_stream, content) => logs.push(content)
    });

    expect(result).toEqual({ exitCode: 0, errorMessage: null });
    expect(logs.join("")).toContain("shim stdout");
    expect(logs.join("")).not.toContain("INJECTED_STDOUT");
    expect(logs.join("")).not.toContain("INJECTED");
    const recorded = JSON.parse(readFileSync(recordPath, "utf8")) as {
      cwd: string;
      args: string[];
    };
    expect(recorded.cwd).toBe(workspacePath);
    expect(recorded.args).toEqual([
      "--shim-flag",
      "run",
      "--agent",
      "build",
      "--format",
      "json",
      "--dir",
      workspacePath,
      prompt
    ]);
    expect(recorded.args).not.toContain("--model");
  });

  it.skipIf(process.platform !== "win32")("resolves an extensionless Windows command to a .cmd shim on PATH", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-opencode-path-"));
    const workspacePath = path.join(tempDir, "workspace");
    mkdirSync(workspacePath);
    const commandPath = path.join(tempDir, "opencode.cmd");
    const cliPath = path.join(tempDir, "opencode-shim-target.cjs");
    const recordPath = path.join(tempDir, "argv.json");
    writeFileSync(
      cliPath,
      [
        "const fs = require('node:fs');",
        `fs.writeFileSync(${JSON.stringify(recordPath)}, JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2) }));`,
        "console.log('path shim stdout');"
      ].join("\n"),
      "utf8"
    );
    writeFileSync(
      commandPath,
      ["@echo off", `node "${cliPath}" %*`].join("\r\n"),
      "utf8"
    );
    const originalPath = process.env.PATH;
    const originalPathExt = process.env.PATHEXT;
    process.env.PATH = `${tempDir}${path.delimiter}${originalPath ?? ""}`;
    process.env.PATHEXT = ".CMD;.EXE;.BAT;.COM";
    const prompt = "Use default opencode \" & echo INJECTED_STDOUT | more <x>";
    const runner = new OpenCodeAgentRunner(
      {
        ...fakeConfig(tempDir),
        agentProvider: "opencode",
        opencodeCommand: "opencode --shim-flag"
      },
      new EventBus()
    );
    const logs: string[] = [];

    try {
      const result = await runner.run({
        projectId: "project-1",
        runId: "run-1",
        workspacePath,
        prompt,
        onLog: (_stream, content) => logs.push(content)
      });

      expect(result).toEqual({ exitCode: 0, errorMessage: null });
      expect(logs.join("")).toContain("path shim stdout");
      expect(logs.join("")).not.toContain("INJECTED_STDOUT");
      const recorded = JSON.parse(readFileSync(recordPath, "utf8")) as {
        cwd: string;
        args: string[];
      };
      expect(recorded.cwd).toBe(workspacePath);
      expect(recorded.args).toEqual([
        "--shim-flag",
        "run",
        "--agent",
        "build",
        "--format",
        "json",
        "--dir",
        workspacePath,
        prompt
      ]);
      expect(recorded.args).not.toContain("--model");
    } finally {
      restoreEnv("PATH", originalPath);
      restoreEnv("PATHEXT", originalPathExt);
    }
  });

  it.skipIf(process.platform !== "win32")("uses Windows command resolution for health checks", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-opencode-health-"));
    const commandPath = path.join(tempDir, "opencode.cmd");
    const cliPath = path.join(tempDir, "opencode-health-target.cjs");
    const recordPath = path.join(tempDir, "health-argv.json");
    writeFileSync(
      cliPath,
      [
        "const fs = require('node:fs');",
        `fs.writeFileSync(${JSON.stringify(recordPath)}, JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2) }));`,
        "if (process.argv.includes('--version')) {",
        "  console.log('opencode-test 1.0.0');",
        "  process.exit(0);",
        "}",
        "process.exit(2);"
      ].join("\n"),
      "utf8"
    );
    writeFileSync(
      commandPath,
      ["@echo off", `node "${cliPath}" %*`].join("\r\n"),
      "utf8"
    );
    const originalPath = process.env.PATH;
    const originalPathExt = process.env.PATHEXT;
    process.env.PATH = `${tempDir}${path.delimiter}${originalPath ?? ""}`;
    process.env.PATHEXT = ".CMD;.EXE;.BAT;.COM";
    const runner = new OpenCodeAgentRunner(
      {
        ...fakeConfig(tempDir),
        agentProvider: "opencode",
        opencodeCommand: "opencode --shim-flag"
      },
      new EventBus()
    );

    try {
      await expect(runner.healthCheck()).resolves.toEqual({ ok: true });
      const recorded = JSON.parse(readFileSync(recordPath, "utf8")) as {
        cwd: string;
        args: string[];
      };
      expect(recorded.cwd).toBe(tempDir);
      expect(recorded.args).toEqual(["--shim-flag", "--version"]);
    } finally {
      restoreEnv("PATH", originalPath);
      restoreEnv("PATHEXT", originalPathExt);
    }
  });

  it.skipIf(process.platform !== "win32")("cancels a Windows shim process tree", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-opencode-cancel-"));
    const workspacePath = path.join(tempDir, "workspace");
    mkdirSync(workspacePath);
    const commandPath = path.join(tempDir, "opencode.cmd");
    const cliPath = path.join(tempDir, "opencode-long-running.cjs");
    const pidPath = path.join(tempDir, "child.pid");
    writeFileSync(
      cliPath,
      [
        "const fs = require('node:fs');",
        `fs.writeFileSync(${JSON.stringify(pidPath)}, String(process.pid));`,
        "setInterval(() => {}, 1000);"
      ].join("\n"),
      "utf8"
    );
    writeFileSync(
      commandPath,
      ["@echo off", `node "${cliPath}" %*`].join("\r\n"),
      "utf8"
    );
    const runner = new OpenCodeAgentRunner(
      {
        ...fakeConfig(tempDir),
        agentProvider: "opencode",
        opencodeCommand: `"${commandPath}"`
      },
      new EventBus()
    );

    const runPromise = runner.run({
      projectId: "project-1",
      runId: "run-1",
      workspacePath,
      prompt: "Build slowly",
      onLog: () => {}
    });
    const childPid = Number(await waitForFileText(pidPath));

    runner.cancel("run-1");
    const result = await runPromise;

    expect(result.exitCode).not.toBe(0);
    await waitFor(() => !isProcessRunning(childPid));
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

async function waitForFileText(filePath: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      return readFileSync(filePath, "utf8");
    } catch (error) {
      lastError = error;
      await delay(20);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Timed out reading ${filePath}`);
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await delay(20);
  }
  throw new Error("Timed out waiting for condition");
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fakeConfig(root: string): AppConfig {
  return {
    appRoot: root,
    apiHost: "127.0.0.1",
    apiPort: 4317,
    webOrigin: "http://127.0.0.1:5173",
    storageDir: path.join(root, "storage"),
    workspaceDir: path.join(root, "workspaces"),
    templatesDir: path.join(root, "templates"),
    agentProvider: "fake",
    opencodeCommand: "opencode",
    opencodeAgent: "build",
    opencodeRunFormat: "json",
    previewHost: "127.0.0.1",
    previewPortStart: 6200,
    workflowRuntime: "local",
    apiFlowSidecarUrl: "http://127.0.0.1:9527"
  };
}
