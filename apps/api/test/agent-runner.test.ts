import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AppConfig } from "../src/config.js";
import { FakeAgentRunner } from "../src/agent/agent-runner.js";
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
});

describe("FakeAgentRunner", () => {
  it("emits logs and writes valid TSX for prompts with JSX-sensitive characters", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-agent-"));
    const bus = new EventBus();
    const runner = new FakeAgentRunner(fakeConfig(tempDir), bus);
    const logs: string[] = [];
    bus.subscribe("project-1", (event) => {
      if (event.type === "run.log") logs.push(event.log.content);
    });

    const result = await runner.run({
      projectId: "project-1",
      runId: "run-1",
      workspacePath: tempDir,
      prompt: "Build `<Todo />` with ${state}, braces { ok }, and \"quotes\""
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
