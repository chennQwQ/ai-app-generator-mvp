import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import type { PreviewInfo, ProjectEvent } from "@ai-app-generator/shared";
import { loadConfig, type AppConfig } from "../src/config.js";
import { EventBus } from "../src/events/event-bus.js";
import { PreviewManager } from "../src/preview/preview-manager.js";
import { ProjectNotFoundError, type ProjectService } from "../src/projects/project-service.js";
import { registerPreviewRoutes } from "../src/routes/preview.js";
import { createServer } from "../src/server.js";

let tempDir: string | undefined;

afterEach(async () => {
  await delay(250);
  if (tempDir) rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  tempDir = undefined;
});

describe("PreviewManager", () => {
  it("allocates incrementing preview ports, builds URLs, and publishes running status", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-preview-"));
    const config = testConfig(tempDir, { PREVIEW_HOST: "localhost", PREVIEW_PORT_START: "7300" });
    const workspaceA = makeNodeWorkspace(tempDir, "workspace-a");
    const workspaceB = makeNodeWorkspace(tempDir, "workspace-b");
    const bus = new EventBus();
    const manager = new PreviewManager(config, bus, {
      command: process.execPath,
      args: [path.join(workspaceA, "server.js")]
    });
    const events: ProjectEvent[] = [];
    bus.subscribe("project-a", (event) => events.push(event));
    bus.subscribe("project-b", (event) => events.push(event));

    const first = manager.start("project-a", workspaceA);
    const second = manager.start("project-b", workspaceB);

    expect(first).toEqual({ status: "running", port: 7300, url: "http://localhost:7300" });
    expect(second).toEqual({ status: "running", port: 7301, url: "http://localhost:7301" });
    expect(events).toEqual([
      { type: "preview.status", projectId: "project-a", preview: first },
      { type: "preview.status", projectId: "project-b", preview: second }
    ]);

    manager.stopAll();
  });

  it("publishes error and forgets previews that exit early", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-preview-"));
    const config = testConfig(tempDir, { PREVIEW_PORT_START: "7450" });
    const workspace = makeNodeWorkspace(tempDir, "workspace");
    const exitScript = writeWorkspaceScript(workspace, "exit.js", "setTimeout(() => process.exit(7), 10);\n");
    const bus = new EventBus();
    const manager = new PreviewManager(config, bus, {
      command: process.execPath,
      args: [exitScript]
    });
    const errorStatus = waitForPreviewStatus(bus, "project-a", "error");

    const preview = manager.start("project-a", workspace);
    const errorPreview = await errorStatus;
    const stopped = manager.stop("project-a");

    expect(preview).toEqual({ status: "running", port: 7450, url: "http://127.0.0.1:7450" });
    expect(errorPreview).toEqual({ status: "error", port: 7450, url: "http://127.0.0.1:7450" });
    expect(stopped).toEqual({ status: "stopped", port: null, url: null });
  });

  it("publishes error when the preview command cannot spawn", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-preview-"));
    const config = testConfig(tempDir, { PREVIEW_PORT_START: "7455" });
    const workspace = makeNodeWorkspace(tempDir, "workspace");
    const bus = new EventBus();
    const manager = new PreviewManager(config, bus, {
      command: "missing-preview-command-for-test",
      args: []
    });
    const errorStatus = waitForPreviewStatus(bus, "project-a", "error");

    const preview = manager.start("project-a", workspace);
    const errorPreview = await errorStatus;

    expect(preview).toEqual({ status: "running", port: 7455, url: "http://127.0.0.1:7455" });
    expect(errorPreview).toEqual({ status: "error", port: 7455, url: "http://127.0.0.1:7455" });
  });

  it("runs install before publishing a running dev server", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-preview-"));
    const config = testConfig(tempDir, { PREVIEW_PORT_START: "7460" });
    const workspace = makeNodeWorkspace(tempDir, "workspace");
    const installScript = writeWorkspaceScript(
      workspace,
      "install.js",
      "require('node:fs').writeFileSync('installed.txt', 'ok');\n"
    );
    const devScript = writeWorkspaceScript(workspace, "dev.js", "setInterval(() => {}, 1000);\n");
    const bus = new EventBus();
    const manager = new PreviewManager(config, bus, {
      install: { command: process.execPath, args: [installScript] },
      dev: () => ({ command: process.execPath, args: [devScript] })
    });
    const runningStatus = waitForPreviewStatus(bus, "project-a", "running");

    const preview = manager.start("project-a", workspace);
    const runningPreview = await runningStatus;

    expect(preview).toEqual({ status: "starting", port: 7460, url: "http://127.0.0.1:7460" });
    expect(runningPreview).toEqual({ status: "running", port: 7460, url: "http://127.0.0.1:7460" });
    expect(existsSync(path.join(workspace, "installed.txt"))).toBe(true);

    manager.stopAll();
  });

  it("stops an existing project preview before starting a replacement", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-preview-"));
    const config = testConfig(tempDir, { PREVIEW_PORT_START: "7400" });
    const workspace = makeNodeWorkspace(tempDir, "workspace");
    const bus = new EventBus();
    const manager = new PreviewManager(config, bus, {
      command: process.execPath,
      args: [path.join(workspace, "server.js")]
    });
    const previews: PreviewInfo[] = [];
    bus.subscribe("project-a", (event) => {
      if (event.type === "preview.status") previews.push(event.preview);
    });

    const first = manager.start("project-a", workspace);
    const second = manager.start("project-a", workspace);
    const stopped = manager.stop("project-a");
    const missing = manager.stop("missing-project");

    expect(first.port).toBe(7400);
    expect(second).toEqual({ status: "running", port: 7401, url: "http://127.0.0.1:7401" });
    expect(stopped).toEqual({ status: "stopped", port: null, url: null });
    expect(missing).toEqual({ status: "stopped", port: null, url: null });
    expect(previews).toEqual([first, { status: "stopped", port: null, url: null }, second, stopped]);

    manager.stopAll();
  });
});

describe("preview routes", () => {
  it("is registered by createServer and returns 404 for missing projects", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-preview-"));
    const app = await createServer(testConfig(tempDir));

    const response = await app.inject({
      method: "POST",
      url: "/api/projects/missing-project/preview/start"
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: "Project not found" });

    await app.close();
  });

  it("starts and stops previews for a project workspace", async () => {
    const app = Fastify({ logger: false });
    const starts: Array<{ projectId: string; workspacePath: string }> = [];
    const stops: string[] = [];
    await registerPreviewRoutes(
      app,
      {
        getWorkspacePath: (projectId: string) => `workspace-${projectId}`
      } as unknown as ProjectService,
      {
        start: (projectId: string, workspacePath: string) => {
          starts.push({ projectId, workspacePath });
          return { status: "running", port: 7500, url: "http://127.0.0.1:7500" };
        },
        stop: (projectId: string) => {
          stops.push(projectId);
          return { status: "stopped", port: null, url: null };
        }
      }
    );

    const startResponse = await app.inject({
      method: "POST",
      url: "/api/projects/project-1/preview/start"
    });
    const stopResponse = await app.inject({
      method: "POST",
      url: "/api/projects/project-1/preview/stop"
    });

    expect(startResponse.statusCode).toBe(200);
    expect(startResponse.json()).toEqual({
      status: "running",
      port: 7500,
      url: "http://127.0.0.1:7500"
    });
    expect(stopResponse.statusCode).toBe(200);
    expect(stopResponse.json()).toEqual({ status: "stopped", port: null, url: null });
    expect(starts).toEqual([{ projectId: "project-1", workspacePath: "workspace-project-1" }]);
    expect(stops).toEqual(["project-1"]);

    await app.close();
  });

  it("returns 404 when starting a preview for a missing project", async () => {
    const app = Fastify({ logger: false });
    await registerPreviewRoutes(
      app,
      {
        getWorkspacePath: (projectId: string) => {
          throw new ProjectNotFoundError(projectId);
        }
      } as unknown as ProjectService,
      {
        start: () => {
          throw new Error("start should not be called");
        },
        stop: () => ({ status: "stopped", port: null, url: null })
      }
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/projects/missing-project/preview/start"
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: "Project not found" });

    await app.close();
  });

  it("returns 404 when stopping a preview for a missing project", async () => {
    const app = Fastify({ logger: false });
    await registerPreviewRoutes(
      app,
      {
        getWorkspacePath: (projectId: string) => {
          throw new ProjectNotFoundError(projectId);
        }
      } as unknown as ProjectService,
      {
        start: () => {
          throw new Error("start should not be called");
        },
        stop: () => ({ status: "stopped", port: null, url: null })
      }
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/projects/missing-project/preview/stop"
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: "Project not found" });

    await app.close();
  });
});

function makeNodeWorkspace(root: string, name: string): string {
  const workspacePath = path.join(root, name);
  mkdirSync(workspacePath, { recursive: true });
  writeWorkspaceScript(workspacePath, "server.js", "setInterval(() => {}, 1000);\n");
  return workspacePath;
}

function writeWorkspaceScript(workspacePath: string, name: string, content: string): string {
  const scriptPath = path.join(workspacePath, name);
  writeFileSync(scriptPath, content, { flag: "wx" });
  return scriptPath;
}

function waitForPreviewStatus(
  bus: EventBus,
  projectId: string,
  status: PreviewInfo["status"]
): Promise<PreviewInfo> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timed out waiting for preview status: ${status}`));
    }, 1000);
    const unsubscribe = bus.subscribe(projectId, (event) => {
      if (event.type !== "preview.status" || event.preview.status !== status) return;
      clearTimeout(timeout);
      unsubscribe();
      resolve(event.preview);
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function testConfig(root: string, env: NodeJS.ProcessEnv = {}): AppConfig {
  return loadConfig({
    APP_ROOT: path.resolve(process.cwd()),
    STORAGE_DIR: path.join(root, "storage"),
    WORKSPACE_DIR: path.join(root, "workspaces"),
    TEMPLATE_DIR: path.resolve(process.cwd(), "templates/react-vite"),
    AGENT_PROVIDER: "fake",
    ...env
  });
}
