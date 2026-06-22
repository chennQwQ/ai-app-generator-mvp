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
    const prompt = "Build from shim & echo INJECTED | more < input > output with \"quotes\"";
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
    const prompt = "Use default opencode & echo INJECTED_STDOUT | more <x> \"quoted\"";
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
        prompt
      ]);
      expect(recorded.args).not.toContain("--model");
    } finally {
      restoreEnv("PATH", originalPath);
      restoreEnv("PATHEXT", originalPathExt);
    }
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

function fakeConfig(root: string): AppConfig {
  return {
    appRoot: root,
    apiHost: "127.0.0.1",
    apiPort: 4317,
    webOrigin: "http://127.0.0.1:5173",
    storageDir: path.join(root, "storage"),
    workspaceDir: path.join(root, "workspaces"),
    templateDir: path.join(root, "template"),
    agentProvider: "fake",
    opencodeCommand: "opencode",
    opencodeAgent: "build",
    opencodeRunFormat: "json",
    previewHost: "127.0.0.1",
    previewPortStart: 6200
  };
}
