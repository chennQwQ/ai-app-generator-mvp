import { nanoid } from "nanoid";
import type Database from "better-sqlite3";
import type { AuditLog } from "@ai-app-generator/shared";

export class AuditService {
  constructor(private readonly db: Database.Database) {}

  recordLog(params: {
    projectId: string;
    runId: string;
    toolName: string;
    parameters: Record<string, unknown>;
    exitCode?: number;
    output?: string;
  }): AuditLog {
    const id = nanoid();
    const now = new Date().toISOString();
    this.db.prepare(`
      insert into audit_logs (id, project_id, run_id, tool_name, parameters, exit_code, output, created_at)
      values (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.projectId,
      params.runId,
      params.toolName,
      JSON.stringify(params.parameters),
      params.exitCode ?? null,
      params.output ?? null,
      now
    );
    return this.getLog(id);
  }

  listByProject(projectId: string): AuditLog[] {
    return this.db.prepare(
      "select * from audit_logs where project_id = ? order by created_at asc"
    ).all(projectId).map(mapAuditLog);
  }

  getLog(id: string): AuditLog {
    const row = this.db.prepare("select * from audit_logs where id = ?").get(id);
    if (!row) throw new Error(`Audit log not found: ${id}`);
    return mapAuditLog(row);
  }
}

function mapAuditLog(row: any): AuditLog {
  return {
    id: row.id,
    projectId: row.project_id,
    runId: row.run_id,
    toolName: row.tool_name,
    parameters: JSON.parse(row.parameters as string),
    exitCode: row.exit_code,
    output: row.output,
    createdAt: row.created_at
  };
}
