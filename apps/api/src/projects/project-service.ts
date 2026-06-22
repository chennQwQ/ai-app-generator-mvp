import { cpSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import type Database from "better-sqlite3";
import type { PreviewInfo, ProjectSummary } from "@ai-app-generator/shared";
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
    return this.db.prepare("select * from projects order by created_at desc").all().map((row) => this.mapProject(row));
  }

  getProject(id: string): ProjectSummary {
    const row = this.db.prepare("select * from projects where id = ?").get(id);
    if (!row) throw new ProjectNotFoundError(id);
    return this.mapProject(row);
  }

  getWorkspacePath(id: string): string {
    const row = this.db.prepare("select workspace_path from projects where id = ?").get(id) as { workspace_path: string } | undefined;
    if (!row) throw new ProjectNotFoundError(id);
    return row.workspace_path;
  }

  updatePreview(id: string, preview: PreviewInfo): ProjectSummary {
    const result = this.db
      .prepare(`
        update projects
        set preview_status = ?, preview_port = ?, updated_at = ?
        where id = ?
      `)
      .run(preview.status, preview.port, new Date().toISOString(), id);
    if (result.changes === 0) throw new ProjectNotFoundError(id);
    return this.getProject(id);
  }

  resetActivePreviews(): void {
    this.db
      .prepare(`
        update projects
        set preview_status = 'stopped', preview_port = null, updated_at = ?
        where preview_status in ('starting', 'running')
      `)
      .run(new Date().toISOString());
  }

  deleteProject(id: string): void {
    const row = this.db.prepare("select workspace_path from projects where id = ?").get(id) as { workspace_path: string } | undefined;
    if (!row) throw new ProjectNotFoundError(id);
    this.db.prepare("delete from projects where id = ?").run(id);
    rmSync(row.workspace_path, { recursive: true, force: true });
  }

  private slugify(name: string, id: string): string {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    return `${base || "project"}-${id.slice(0, 6)}`;
  }

  private mapProject(row: any): ProjectSummary {
    const previewPort = row.preview_port as number | null;
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      previewStatus: row.preview_status,
      previewPort,
      previewUrl: previewPort === null ? null : `http://${this.config.previewHost}:${previewPort}`,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
