import { existsSync, mkdtempSync, rmSync } from "node:fs";
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

describe("react vite template", () => {
  it("contains the files required for preview", () => {
    const root = path.resolve(process.cwd(), "templates/react-vite");
    expect(existsSync(path.join(root, "package.json"))).toBe(true);
    expect(existsSync(path.join(root, "index.html"))).toBe(true);
    expect(existsSync(path.join(root, "src/App.tsx"))).toBe(true);
    expect(existsSync(path.join(root, "src/main.tsx"))).toBe(true);
  });
});

describe("vue vite template", () => {
  it("contains the files required for preview", () => {
    const root = path.resolve(process.cwd(), "templates/vue-vite");
    expect(existsSync(path.join(root, "package.json"))).toBe(true);
    expect(existsSync(path.join(root, "index.html"))).toBe(true);
    expect(existsSync(path.join(root, "vite.config.ts"))).toBe(true);
    expect(existsSync(path.join(root, "tsconfig.json"))).toBe(true);
    expect(existsSync(path.join(root, "env.d.ts"))).toBe(true);
    expect(existsSync(path.join(root, "src/App.vue"))).toBe(true);
    expect(existsSync(path.join(root, "src/main.ts"))).toBe(true);
    expect(existsSync(path.join(root, "src/styles.css"))).toBe(true);
  });
});

describe("template list api", () => {
  it("returns available templates with metadata", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-templates-"));
    const config = loadConfig({
      STORAGE_DIR: path.join(tempDir, "storage"),
      WORKSPACE_DIR: path.join(tempDir, "workspaces"),
      TEMPLATES_DIR: path.resolve(process.cwd(), "templates")
    });
    const app = await createServer(config);

    const response = await app.inject({ method: "GET", url: "/api/templates" });
    expect(response.statusCode).toBe(200);
    const templates = response.json();
    expect(templates).toBeInstanceOf(Array);
    expect(templates.length).toBeGreaterThanOrEqual(2);
    expect(templates.find((t: any) => t.id === "react-vite")).toBeDefined();
    expect(templates.find((t: any) => t.id === "vue-vite")).toBeDefined();
    await app.close();
  });
});
