import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { createAgentRunner } from "../src/agent/agent-runner.js";
import { EventBus } from "../src/events/event-bus.js";

describe("agent health check", () => {
  it("fake runner always reports as available", async () => {
    const runner = createAgentRunner(loadConfig({ AGENT_PROVIDER: "fake" }), new EventBus());
    const result = await runner.healthCheck();
    expect(result.ok).toBe(true);
  });

  it("opencode runner reports unavailable when command is missing", async () => {
    const runner = createAgentRunner(
      loadConfig({ AGENT_PROVIDER: "opencode", OPENCODE_COMMAND: "nonexistent-opencode-cli" }),
      new EventBus()
    );
    const result = await runner.healthCheck();
    expect(result.ok).toBe(false);
  });
});
