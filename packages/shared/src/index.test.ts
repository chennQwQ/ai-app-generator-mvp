import { describe, expect, it } from "vitest";
import { isTerminalRunStatus, projectEventTypes, toolDefinitions, getToolDefinition } from "./index.js";

describe("shared domain helpers", () => {
  it("identifies terminal run statuses", () => {
    expect(isTerminalRunStatus("succeeded")).toBe(true);
    expect(isTerminalRunStatus("failed")).toBe(true);
    expect(isTerminalRunStatus("cancelled")).toBe(true);
    expect(isTerminalRunStatus("running")).toBe(false);
  });

  it("lists websocket event types used by the API and web app", () => {
    expect(projectEventTypes).toEqual([
      "run.status",
      "run.log",
      "files.changed",
      "preview.status",
      "error"
    ]);
  });

  it("defines shell, file_write, npm_install, and npm_build tools", () => {
    expect(toolDefinitions).toHaveLength(4);
    expect(toolDefinitions.find((t) => t.name === "shell")).toBeDefined();
    expect(toolDefinitions.find((t) => t.name === "file_write")).toBeDefined();
    expect(toolDefinitions.find((t) => t.name === "npm_install")).toBeDefined();
    expect(toolDefinitions.find((t) => t.name === "npm_build")).toBeDefined();
  });

  it("finds tool definitions by name", () => {
    const shell = getToolDefinition("shell")!;
    expect(shell.parameters).toBeDefined();
    expect(shell.parameters.length).toBeGreaterThan(0);
    expect(getToolDefinition("nonexistent")).toBeUndefined();
  });
});
