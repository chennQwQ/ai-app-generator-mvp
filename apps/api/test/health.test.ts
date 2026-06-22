import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";
import { loadConfig } from "../src/config.js";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe("health route", () => {
  it("returns ok", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-health-"));
    const app = await createServer(loadConfig({
      APP_ROOT: path.resolve(process.cwd()),
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces")
    }));
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, agent: { ok: true } });
    await app.close();
  });
});
