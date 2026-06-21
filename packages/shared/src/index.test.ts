import { describe, expect, it } from "vitest";
import { isTerminalRunStatus, projectEventTypes } from "./index.js";

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
});
