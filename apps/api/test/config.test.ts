import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("loads defaults for local development", () => {
    const config = loadConfig({});
    expect(config.apiHost).toBe("127.0.0.1");
    expect(config.apiPort).toBe(4317);
    expect(config.agentProvider).toBe("fake");
    expect(config.opencodeCommand).toBe("opencode");
  });
});
