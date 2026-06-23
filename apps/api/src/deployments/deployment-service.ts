import { exec } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import type Database from "better-sqlite3";
import type { DeploymentInfo, DeploymentStatus } from "@ai-app-generator/shared";
import type { AppConfig } from "../config.js";
import type { EventBus } from "../events/event-bus.js";
import type { ProjectService } from "../projects/project-service.js";

export class DeploymentService {
  constructor(
    private readonly db: Database.Database,
    private readonly config: AppConfig,
    private readonly bus: EventBus,
    private readonly projects: ProjectService
  ) {}

  build(projectId: string): DeploymentInfo {
    const workspacePath = this.projects.getWorkspacePath(projectId);
    const now = new Date().toISOString();
    const id = nanoid();
    const outputDir = path.join(this.config.storageDir, "deployments", projectId);

    this.db.prepare(`
      insert into deployments (id, project_id, status, output_dir, created_at)
      values (?, ?, 'building', ?, ?)
    `).run(id, projectId, outputDir, now);

    const info: DeploymentInfo = {
      projectId,
      status: "building",
      url: null,
      errorLog: null,
      startedAt: now,
      finishedAt: null
    };

    this.bus.publish({ type: "deploy.status", projectId, deploy: info });

    void this.runBuild(id, projectId, workspacePath, outputDir);

    return info;
  }

  getLatest(projectId: string): DeploymentInfo | null {
    const row = this.db.prepare(
      "select * from deployments where project_id = ? order by created_at desc limit 1"
    ).get(projectId) as any;
    if (!row) return null;
    return this.mapRow(row);
  }

  private async runBuild(
    deployId: string,
    projectId: string,
    workspacePath: string,
    outputDir: string
  ): Promise<void> {
    const startedAt = new Date().toISOString();
    this.db.prepare("update deployments set started_at = ? where id = ?").run(startedAt, deployId);

    try {
      await runCommand("npm install", workspacePath);
      await runCommand("npm run build", workspacePath);

      const sourceDist = path.join(workspacePath, "dist");
      const deployDist = path.join(outputDir, "dist");
      const deployPrev = path.join(outputDir, "dist-prev");

      rmSync(deployPrev, { recursive: true, force: true });
      if (exists(deployDist)) {
        cpSync(deployDist, deployPrev, { recursive: true, force: true });
      }
      mkdirSync(path.dirname(deployDist), { recursive: true });
      cpSync(sourceDist, deployDist, { recursive: true });

      const finishedAt = new Date().toISOString();
      this.db.prepare(
        "update deployments set status = ?, finished_at = ? where id = ?"
      ).run("succeeded", finishedAt, deployId);

      this.bus.publish({
        type: "deploy.status",
        projectId,
        deploy: {
          projectId,
          status: "succeeded",
          url: `/deploy/${projectId}/`,
          errorLog: null,
          startedAt,
          finishedAt
        }
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Build failed";
      const finishedAt = new Date().toISOString();
      this.db.prepare(
        "update deployments set status = ?, error_log = ?, finished_at = ? where id = ?"
      ).run("failed", errorMessage, finishedAt, deployId);

      this.bus.publish({
        type: "deploy.status",
        projectId,
        deploy: {
          projectId,
          status: "failed",
          url: null,
          errorLog: errorMessage,
          startedAt,
          finishedAt
        }
      });
    }
  }

  private mapRow(row: any): DeploymentInfo {
    return {
      projectId: row.project_id,
      status: row.status,
      url: row.status === "succeeded" ? `/deploy/${row.project_id}/` : null,
      errorLog: row.error_log,
      startedAt: row.started_at,
      finishedAt: row.finished_at
    };
  }
}

function runCommand(command: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = exec(command, {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
      timeout: 120000,
      windowsHide: true
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${command} failed:\n${stderr || stdout || error.message}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

function exists(p: string): boolean {
  try {
    const { statSync } = require("node:fs");
    statSync(p);
    return true;
  } catch {
    return false;
  }
}
