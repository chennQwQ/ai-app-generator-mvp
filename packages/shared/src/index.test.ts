import { describe, expect, it } from "vitest";
import { isTerminalRunStatus, isTerminalWorkflowRunStatus, projectEventTypes, workflowNodeTypes, workflowEventTypes, apiFlowCompatibleNodeTypes, toolDefinitions, getToolDefinition } from "./index.js";

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

  it("defines required schema fields for tool parameters", () => {
    for (const tool of toolDefinitions) {
      expect(tool.description).toEqual(expect.any(String));
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.parameters.length).toBeGreaterThan(0);
      for (const parameter of tool.parameters) {
        expect(parameter.name).toEqual(expect.any(String));
        expect(parameter.type).toMatch(/^(string|number|boolean)$/);
        expect(parameter.description).toEqual(expect.any(String));
        expect(parameter.description.length).toBeGreaterThan(0);
      }
    }

    expect(getToolDefinition("shell")?.parameters).toContainEqual(
      expect.objectContaining({ name: "command", type: "string", required: true })
    );
    expect(getToolDefinition("file_write")?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "path", type: "string", required: true }),
        expect.objectContaining({ name: "content", type: "string", required: true })
      ])
    );
    expect(getToolDefinition("npm_install")?.parameters).toContainEqual(
      expect.objectContaining({ name: "dev", type: "boolean", default: false })
    );
    expect(getToolDefinition("npm_build")?.parameters).toContainEqual(
      expect.objectContaining({ name: "script", type: "string", default: "build" })
    );
  });

  it("identifies terminal workflow run statuses", () => {
    expect(isTerminalWorkflowRunStatus("succeeded")).toBe(true);
    expect(isTerminalWorkflowRunStatus("failed")).toBe(true);
    expect(isTerminalWorkflowRunStatus("cancelled")).toBe(true);
    expect(isTerminalWorkflowRunStatus("running")).toBe(false);
    expect(isTerminalWorkflowRunStatus("queued")).toBe(false);
  });

  it("lists workflow node types", () => {
    expect(workflowNodeTypes).toEqual(["user_input", "agent_generation", "shell_command"]);
  });

  it("lists workflow websocket event types", () => {
    expect(workflowEventTypes).toEqual([
      "workflow.run.status",
      "workflow.node.status"
    ]);
  });

  it("lists apiFlow v1 compatible node types", () => {
    expect(apiFlowCompatibleNodeTypes).toEqual(["user_input"]);
  });
});
