import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import type { FileNode } from "@ai-app-generator/shared";

const ignoredNames = new Set(["node_modules", ".git", "dist", ".env", ".cache", "coverage"]);
const defaultMaxFileBytes = 256 * 1024;

export class InvalidFilePathError extends Error {
  constructor() {
    super("Invalid file path");
    this.name = "InvalidFilePathError";
  }
}

export class FileNotFoundError extends Error {
  constructor() {
    super("File not found");
    this.name = "FileNotFoundError";
  }
}

export class DirectoryReadError extends Error {
  constructor() {
    super("Cannot read directories");
    this.name = "DirectoryReadError";
  }
}

export class FileTooLargeError extends Error {
  constructor() {
    super("File is too large");
    this.name = "FileTooLargeError";
  }
}

export class FileService {
  constructor(private readonly maxFileBytes = defaultMaxFileBytes) {}

  async getTree(workspacePath: string): Promise<FileNode[]> {
    const rootPath = path.resolve(workspacePath);
    return this.listDirectory(rootPath, "");
  }

  async readFile(workspacePath: string, relativePath: string): Promise<string> {
    const rootPath = path.resolve(workspacePath);
    const targetPath = resolveWorkspacePath(rootPath, relativePath);
    let stats;

    await assertNoSymlinkPathComponents(rootPath, targetPath);

    try {
      stats = await lstat(targetPath);
    } catch (error) {
      if (isNotFoundError(error)) throw new FileNotFoundError();
      throw error;
    }

    if (stats.isSymbolicLink()) throw new InvalidFilePathError();
    if (stats.isDirectory()) throw new DirectoryReadError();
    if (!stats.isFile()) throw new InvalidFilePathError();
    if (stats.size > this.maxFileBytes) throw new FileTooLargeError();

    const [rootRealPath, targetRealPath] = await Promise.all([
      realpath(rootPath),
      realpath(targetPath)
    ]);
    assertInsideWorkspace(rootRealPath, targetRealPath);

    return readFile(targetPath, "utf8");
  }

  private async listDirectory(currentPath: string, relativePath: string): Promise<FileNode[]> {
    const entries = await readdir(currentPath, { withFileTypes: true });
    const nodes = await Promise.all(
      entries
        .filter((entry) => !isIgnoredName(entry.name))
        .map(async (entry): Promise<FileNode | null> => {
          const entryPath = path.join(currentPath, entry.name);
          const entryRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
          const stats = await lstat(entryPath);

          if (stats.isSymbolicLink()) return null;
          if (stats.isDirectory()) {
            return {
              name: entry.name,
              path: entryRelativePath,
              type: "directory",
              children: await this.listDirectory(entryPath, entryRelativePath)
            };
          }
          if (!stats.isFile()) return null;
          return {
            name: entry.name,
            path: entryRelativePath,
            type: "file"
          };
        })
    );

    return nodes
      .filter((node): node is FileNode => node !== null)
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
      });
  }
}

function resolveWorkspacePath(rootPath: string, relativePath: string): string {
  if (!relativePath || isAbsolutePath(relativePath)) throw new InvalidFilePathError();
  const normalizedPath = relativePath.replace(/\\/g, path.sep);
  if (hasIgnoredPathComponent(normalizedPath)) throw new InvalidFilePathError();
  const targetPath = path.resolve(rootPath, normalizedPath);
  assertInsideWorkspace(rootPath, targetPath);
  return targetPath;
}

function hasIgnoredPathComponent(relativePath: string): boolean {
  return relativePath
    .split(/[\\/]+/)
    .filter(Boolean)
    .some(isIgnoredName);
}

function isIgnoredName(name: string): boolean {
  return ignoredNames.has(name.toLowerCase());
}

function isAbsolutePath(filePath: string): boolean {
  return path.isAbsolute(filePath) || path.win32.isAbsolute(filePath) || path.posix.isAbsolute(filePath);
}

function assertInsideWorkspace(rootPath: string, targetPath: string): void {
  const relative = path.relative(rootPath, targetPath);
  if (relative === "") return;
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new InvalidFilePathError();
  }
}

async function assertNoSymlinkPathComponents(rootPath: string, targetPath: string): Promise<void> {
  const relativePath = path.relative(rootPath, targetPath);
  const parts = relativePath.split(path.sep).filter(Boolean);
  let currentPath = rootPath;

  for (const part of parts) {
    currentPath = path.join(currentPath, part);
    let stats;
    try {
      stats = await lstat(currentPath);
    } catch (error) {
      if (isNotFoundError(error)) throw new FileNotFoundError();
      throw error;
    }
    if (stats.isSymbolicLink()) throw new InvalidFilePathError();
  }
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
