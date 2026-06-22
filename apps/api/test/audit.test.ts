import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { createServer } from "../src/server.js";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe("audit routes", () => {
  it("returns an empty audit list when no runs have been made", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-audit-"));
    const config = loadConfig({
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces"),
      TEMPLATE_DIR: path.resolve(process.cwd(), "templates/react-vite")
    });
    const app = await createServer(config);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Audit Test" }
    });
    const project = createRes.json();

    const response = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/audit`
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
    await app.close();
  });
});
