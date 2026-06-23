import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import type { FileNode } from "@ai-app-generator/shared";
import { loadConfig, type AppConfig } from "../src/config.js";
import { FileService } from "../src/files/file-service.js";
import { ProjectNotFoundError, type ProjectService } from "../src/projects/project-service.js";
import { registerFileRoutes } from "../src/routes/files.js";
import { createServer } from "../src/server.js";

let tempDir: string | undefined;
const canCreateFileSymlinks = probeFileSymlinkSupport();

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe("FileService", () => {
  it("returns a sorted workspace tree and excludes generated or private directories", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-files-"));
    const workspacePath = path.join(tempDir, "workspace");
    createWorkspace(workspacePath);
    const service = new FileService();

    const tree = await service.getTree(workspacePath);

    expect(flattenTree(tree)).toEqual([
      "src/",
      "src/App.tsx",
      "README.md",
      "package.json"
    ]);
    expect(flattenTree(tree)).not.toEqual(expect.arrayContaining([
      "node_modules/hidden.js",
      ".git/config",
      "dist/app.js",
      ".env",
      ".cache/state.json",
      "coverage/index.html"
    ]));
  });

  it("excludes ignored tree entries with case variants", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-files-"));
    const workspacePath = path.join(tempDir, "workspace");
    createWorkspaceWithCaseVariantIgnoredEntries(workspacePath);
    const service = new FileService();

    const tree = await service.getTree(workspacePath);

    expect(flattenTree(tree)).toEqual(["src/", "src/App.tsx"]);
  });

  it("reads UTF-8 file content by workspace-relative path", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-files-"));
    const workspacePath = path.join(tempDir, "workspace");
    createWorkspace(workspacePath);
    const service = new FileService();

    await expect(service.readFile(workspacePath, "src\\App.tsx")).resolves.toBe("export default function App() {}\n");
  });

  it.each([
    ".env",
    ".ENV",
    "node_modules/hidden.js",
    "NODE_MODULES/hidden.js",
    ".git/config",
    ".GIT/config",
    "dist/app.js",
    ".cache/state.json",
    "coverage/index.html"
  ])("rejects direct reads of ignored path %s", async (relativePath) => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-files-"));
    const workspacePath = path.join(tempDir, "workspace");
    createWorkspace(workspacePath);
    const service = new FileService();

    await expect(service.readFile(workspacePath, relativePath)).rejects.toThrow("Invalid file path");
  });

  it.each(["../secret.txt", "..\\secret.txt", path.resolve("secret.txt"), "C:\\secret.txt"])(
    "rejects invalid file path %s",
    async (relativePath) => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-files-"));
    const workspacePath = path.join(tempDir, "workspace");
    createWorkspace(workspacePath);
    const service = new FileService();

    await expect(service.readFile(workspacePath, relativePath)).rejects.toThrow("Invalid file path");
    }
  );

  it.skipIf(!canCreateFileSymlinks)("rejects direct symlink file reads", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-files-"));
    const workspacePath = path.join(tempDir, "workspace");
    createWorkspace(workspacePath);
    symlinkSync(path.join(workspacePath, "README.md"), path.join(workspacePath, "readme-link.md"), "file");
    const service = new FileService();

    await expect(service.readFile(workspacePath, "readme-link.md")).rejects.toThrow("Invalid file path");
  });

  it("rejects reads through symlink directory components", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-files-"));
    const workspacePath = path.join(tempDir, "workspace");
    createWorkspace(workspacePath);
    symlinkSync(path.join(workspacePath, "src"), path.join(workspacePath, "linked-src"), "junction");
    const service = new FileService();

    await expect(service.readFile(workspacePath, "linked-src/App.tsx")).rejects.toThrow("Invalid file path");
  });

  it("rejects directory reads with a client-safe error", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-files-"));
    const workspacePath = path.join(tempDir, "workspace");
    createWorkspace(workspacePath);
    const service = new FileService();

    await expect(service.readFile(workspacePath, "src")).rejects.toThrow("Cannot read directories");
  });

  it("rejects large file reads with a client-safe error", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-files-"));
    const workspacePath = path.join(tempDir, "workspace");
    createWorkspace(workspacePath);
    writeFileSync(path.join(workspacePath, "large.txt"), "x".repeat(257 * 1024));
    const service = new FileService();

    await expect(service.readFile(workspacePath, "large.txt")).rejects.toThrow("File is too large");
  });
});

describe("file routes", () => {
  it("lists files and reads content for a createServer-created project", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-file-routes-"));
    const app = await createServer(testConfig(tempDir));

    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "File Browser App" }
    });
    const project = projectResponse.json();

    const treeResponse = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/files`
    });
    const contentResponse = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/files/content?path=${encodeURIComponent("package.json")}`
    });

    expect(treeResponse.statusCode).toBe(200);
    expect(flattenTree(treeResponse.json())).toEqual(expect.arrayContaining([
      "src/",
      "src/App.tsx",
      "package.json"
    ]));
    expect(contentResponse.statusCode).toBe(200);
    expect(contentResponse.json().content).toContain("\"scripts\"");

    await app.close();
  });

  it("returns 400 when the content path query is missing", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-file-routes-"));
    const app = await createServer(testConfig(tempDir));
    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Missing Path App" }
    });
    const project = projectResponse.json();

    const response = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/files/content`
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ message: "File path is required" });

    await app.close();
  });

  it("returns 400 for path traversal attempts", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-file-routes-"));
    const app = await createServer(testConfig(tempDir));
    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Traversal App" }
    });
    const project = projectResponse.json();

    const response = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/files/content?path=${encodeURIComponent("../secret.txt")}`
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ message: "Invalid file path" });

    await app.close();
  });

  it("returns 400 for direct reads of ignored files", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-file-routes-"));
    const config = testConfig(tempDir);
    const app = await createServer(config);

    try {
      const projectResponse = await app.inject({
        method: "POST",
        url: "/api/projects",
        payload: { name: "Ignored File App" }
      });
      const project = projectResponse.json();
      writeFileSync(path.join(config.workspaceDir, project.id, ".env"), "SECRET=value\n");

      const response = await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/files/content?path=${encodeURIComponent(".env")}`
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ message: "Invalid file path" });
    } finally {
      await app.close();
    }
  });

  it("returns 400 for direct reads of ignored files with case variants", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-file-routes-"));
    const config = testConfig(tempDir);
    const app = await createServer(config);

    try {
      const projectResponse = await app.inject({
        method: "POST",
        url: "/api/projects",
        payload: { name: "Ignored Case App" }
      });
      const project = projectResponse.json();
      writeFileSync(path.join(config.workspaceDir, project.id, ".env"), "SECRET=value\n");

      const response = await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/files/content?path=${encodeURIComponent(".ENV")}`
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ message: "Invalid file path" });
    } finally {
      await app.close();
    }
  });

  it("returns 400 for reads through symlink directory components", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-file-routes-"));
    const config = testConfig(tempDir);
    const app = await createServer(config);

    try {
      const projectResponse = await app.inject({
        method: "POST",
        url: "/api/projects",
        payload: { name: "Symlink Route App" }
      });
      const project = projectResponse.json();
      const workspacePath = path.join(config.workspaceDir, project.id);
      symlinkSync(path.join(workspacePath, "src"), path.join(workspacePath, "linked-src"), "junction");

      const response = await app.inject({
        method: "GET",
        url: `/api/projects/${project.id}/files/content?path=${encodeURIComponent("linked-src/App.tsx")}`
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ message: "Invalid file path" });
    } finally {
      await app.close();
    }
  });

  it("returns 404 when the project is missing", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-file-routes-"));
    const app = await createServer(testConfig(tempDir));

    const response = await app.inject({
      method: "GET",
      url: "/api/projects/missing-project/files"
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: "Project not found" });

    await app.close();
  });

  it("maps missing files, directories, and large files to client-safe responses", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-file-routes-"));
    const config = testConfig(tempDir);
    const app = await createServer(config);
    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Read Error App" }
    });
    const project = projectResponse.json();
    writeFileSync(path.join(config.workspaceDir, project.id, "large.txt"), "x".repeat(257 * 1024));

    const missingFile = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/files/content?path=${encodeURIComponent("missing.txt")}`
    });
    const directory = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/files/content?path=${encodeURIComponent("src")}`
    });
    const largeFile = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/files/content?path=${encodeURIComponent("large.txt")}`
    });

    expect(missingFile.statusCode).toBe(404);
    expect(missingFile.json()).toEqual({ message: "File not found" });
    expect(directory.statusCode).toBe(400);
    expect(directory.json()).toEqual({ message: "Cannot read directories" });
    expect(largeFile.statusCode).toBe(413);
    expect(largeFile.json()).toEqual({ message: "File is too large" });
    expect(missingFile.body).not.toContain(config.workspaceDir);
    expect(directory.body).not.toContain(config.workspaceDir);
    expect(largeFile.body).not.toContain(config.workspaceDir);

    await app.close();
  });

  it("returns generic 500 responses for unexpected file service errors", async () => {
    const app = Fastify({ logger: false });
    await registerFileRoutes(
      app,
      {
        getWorkspacePath: () => "C:\\workspace\\project"
      } as unknown as ProjectService,
      {
        getTree: async () => {
          throw new Error("raw C:\\secret\\tree-token");
        },
        readFile: async () => {
          throw new Error("raw C:\\secret\\content-token");
        }
      } as unknown as FileService
    );

    const treeResponse = await app.inject({
      method: "GET",
      url: "/api/projects/project-1/files"
    });
    const contentResponse = await app.inject({
      method: "GET",
      url: `/api/projects/project-1/files/content?path=${encodeURIComponent("package.json")}`
    });

    expect(treeResponse.statusCode).toBe(500);
    expect(treeResponse.json()).toEqual({ message: "File listing failed" });
    expect(treeResponse.body).not.toContain("secret");
    expect(treeResponse.body).not.toContain("tree-token");
    expect(contentResponse.statusCode).toBe(500);
    expect(contentResponse.json()).toEqual({ message: "File read failed" });
    expect(contentResponse.body).not.toContain("secret");
    expect(contentResponse.body).not.toContain("content-token");

    await app.close();
  });

  it("returns 404 for missing projects without calling the file service", async () => {
    const app = Fastify({ logger: false });
    await registerFileRoutes(
      app,
      {
        getWorkspacePath: (projectId: string) => {
          throw new ProjectNotFoundError(projectId);
        }
      } as unknown as ProjectService,
      {
        getTree: async () => {
          throw new Error("should not list files");
        },
        readFile: async () => {
          throw new Error("should not read files");
        }
      } as unknown as FileService
    );

    const response = await app.inject({
      method: "GET",
      url: `/api/projects/missing-project/files/content?path=${encodeURIComponent("package.json")}`
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: "Project not found" });

    await app.close();
  });
});

function createWorkspace(workspacePath: string): void {
  mkdirSync(path.join(workspacePath, "src"), { recursive: true });
  mkdirSync(path.join(workspacePath, "node_modules"), { recursive: true });
  mkdirSync(path.join(workspacePath, ".git"), { recursive: true });
  mkdirSync(path.join(workspacePath, "dist"), { recursive: true });
  mkdirSync(path.join(workspacePath, ".cache"), { recursive: true });
  mkdirSync(path.join(workspacePath, "coverage"), { recursive: true });
  writeFileSync(path.join(workspacePath, "src", "App.tsx"), "export default function App() {}\n");
  writeFileSync(path.join(workspacePath, "README.md"), "# App\n");
  writeFileSync(path.join(workspacePath, "package.json"), "{}\n");
  writeFileSync(path.join(workspacePath, "node_modules", "hidden.js"), "");
  writeFileSync(path.join(workspacePath, ".git", "config"), "");
  writeFileSync(path.join(workspacePath, "dist", "app.js"), "");
  writeFileSync(path.join(workspacePath, ".env"), "SECRET=value\n");
  writeFileSync(path.join(workspacePath, ".cache", "state.json"), "{}\n");
  writeFileSync(path.join(workspacePath, "coverage", "index.html"), "");
}

function createWorkspaceWithCaseVariantIgnoredEntries(workspacePath: string): void {
  mkdirSync(path.join(workspacePath, "src"), { recursive: true });
  mkdirSync(path.join(workspacePath, "NODE_MODULES"), { recursive: true });
  mkdirSync(path.join(workspacePath, ".GIT"), { recursive: true });
  mkdirSync(path.join(workspacePath, "DIST"), { recursive: true });
  mkdirSync(path.join(workspacePath, ".CACHE"), { recursive: true });
  mkdirSync(path.join(workspacePath, "COVERAGE"), { recursive: true });
  writeFileSync(path.join(workspacePath, "src", "App.tsx"), "export default function App() {}\n");
  writeFileSync(path.join(workspacePath, "NODE_MODULES", "hidden.js"), "");
  writeFileSync(path.join(workspacePath, ".GIT", "config"), "");
  writeFileSync(path.join(workspacePath, "DIST", "app.js"), "");
  writeFileSync(path.join(workspacePath, ".ENV"), "SECRET=value\n");
  writeFileSync(path.join(workspacePath, ".CACHE", "state.json"), "{}\n");
  writeFileSync(path.join(workspacePath, "COVERAGE", "index.html"), "");
}

function flattenTree(nodes: FileNode[]): string[] {
  return nodes.flatMap((node) => [
    `${node.path}${node.type === "directory" ? "/" : ""}`,
    ...flattenTree(node.children ?? [])
  ]);
}

function testConfig(root: string): AppConfig {
  return loadConfig({
    APP_ROOT: path.resolve(process.cwd()),
    STORAGE_DIR: path.join(root, "storage"),
    WORKSPACE_DIR: path.join(root, "workspaces"),
    AGENT_PROVIDER: "fake"
  });
}

function probeFileSymlinkSupport(): boolean {
  const probeDir = mkdtempSync(path.join(tmpdir(), "ai-generator-symlink-probe-"));
  try {
    const targetPath = path.join(probeDir, "target.txt");
    const linkPath = path.join(probeDir, "link.txt");
    writeFileSync(targetPath, "x");
    symlinkSync(targetPath, linkPath, "file");
    return true;
  } catch {
    return false;
  } finally {
    rmSync(probeDir, { recursive: true, force: true });
  }
}
