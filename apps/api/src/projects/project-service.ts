import { cpSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import type Database from "better-sqlite3";
import type { ProjectSummary } from "@ai-app-generator/shared";
import type { AppConfig } from "../config.js";

export class ProjectNotFoundError extends Error {
  constructor(id: string) {
    super(`Project not found: ${id}`);
    this.name = "ProjectNotFoundError";
  }
}

export class ProjectService {
  constructor(private readonly db: Database.Database, private readonly config: AppConfig) {}

  createProject(name: string): ProjectSummary {
    const now = new Date().toISOString();
    const id = nanoid();
    const slug = this.slugify(name, id);
    const workspacePath = path.join(this.config.workspaceDir, id);

    mkdirSync(this.config.workspaceDir, { recursive: true });
    try {
      cpSync(this.config.templateDir, workspacePath, { recursive: true });
      this.db.transaction(() => {
        this.db.prepare(`
          insert into projects (id, name, slug, workspace_path, status, preview_port, preview_status, created_at, updated_at)
          values (?, ?, ?, ?, 'created', null, 'stopped', ?, ?)
        `).run(id, name, slug, workspacePath, now, now);

        this.db.prepare(`
          insert into conversations (id, project_id, created_at, updated_at)
          values (?, ?, ?, ?)
        `).run(nanoid(), id, now, now);
      })();
    } catch (error) {
      rmSync(workspacePath, { recursive: true, force: true });
      throw error;
    }

    return this.getProject(id);
  }

  listProjects(): ProjectSummary[] {
    return this.db.prepare("select * from projects order by created_at desc").all().map(mapProject);
  }

  getProject(id: string): ProjectSummary {
    const row = this.db.prepare("select * from projects where id = ?").get(id);
    if (!row) throw new ProjectNotFoundError(id);
    return mapProject(row);
  }

  getWorkspacePath(id: string): string {
    const row = this.db.prepare("select workspace_path from projects where id = ?").get(id) as { workspace_path: string } | undefined;
    if (!row) throw new ProjectNotFoundError(id);
    return row.workspace_path;
  }

  private slugify(name: string, id: string): string {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    return `${base || "project"}-${id.slice(0, 6)}`;
  }
}

function mapProject(row: any): ProjectSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    previewStatus: row.preview_status,
    previewPort: row.preview_port,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
