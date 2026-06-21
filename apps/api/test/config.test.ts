import { describe, expect, it } from "vitest";
import path from "node:path";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("loads defaults for local development", () => {
    const config = loadConfig({});
    expect(config.apiHost).toBe("127.0.0.1");
    expect(config.apiPort).toBe(4317);
    expect(config.agentProvider).toBe("fake");
    expect(config.opencodeCommand).toBe("opencode");
  });

  it("resolves default directories from the repo root cwd", () => {
    const repoRoot = path.resolve("D:/work/ai-app-generator-mvp");
    const config = loadConfig({}, { cwd: repoRoot });
    expect(config.appRoot).toBe(repoRoot);
    expect(config.storageDir).toBe(path.join(repoRoot, "storage"));
    expect(config.workspaceDir).toBe(path.join(repoRoot, "workspaces"));
    expect(config.templateDir).toBe(path.join(repoRoot, "templates/react-vite"));
  });

  it("uses APP_ROOT when supplied", () => {
    const cwd = path.resolve("D:/work/ai-app-generator-mvp/apps/api");
    const appRoot = path.resolve("D:/custom/app-root");
    const config = loadConfig({ APP_ROOT: appRoot }, { cwd });
    expect(config.appRoot).toBe(appRoot);
    expect(config.storageDir).toBe(path.join(appRoot, "storage"));
    expect(config.workspaceDir).toBe(path.join(appRoot, "workspaces"));
    expect(config.templateDir).toBe(path.join(appRoot, "templates/react-vite"));
  });
});
