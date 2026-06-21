import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../src/db/database.js";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe("database schema", () => {
  it("creates required tables", () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-db-"));
    const db = openDatabase(path.join(tempDir, "app.sqlite"));
    try {
      const tables = db
        .prepare("select name from sqlite_master where type = 'table' order by name")
        .all()
        .map((row: any) => row.name);
      expect(tables).toContain("projects");
      expect(tables).toContain("conversations");
      expect(tables).toContain("messages");
      expect(tables).toContain("agent_runs");
      expect(tables).toContain("agent_logs");
    } finally {
      db.close();
    }
  });

  it("enables foreign keys and creates required message constraints", () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-db-"));
    const db = openDatabase(path.join(tempDir, "app.sqlite"));

    try {
      const foreignKeys = db.prepare("pragma foreign_keys").all()[0] as any;
      expect(foreignKeys.foreign_keys).toBe(1);

      const messageForeignKeys = db
        .prepare("pragma foreign_key_list(messages)")
        .all() as any[];
      expect(messageForeignKeys).toContainEqual(
        expect.objectContaining({
          from: "agent_run_id",
          table: "agent_runs",
          to: "id",
          on_delete: "SET NULL",
        }),
      );

      const indexes = db
        .prepare("pragma index_list(messages)")
        .all()
        .map((row: any) => row.name);
      expect(indexes).toContain("idx_messages_agent_run_id");

    } finally {
      db.close();
    }
  });

  it("keeps messages when their agent run is deleted", () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-db-"));
    const db = openDatabase(path.join(tempDir, "app.sqlite"));

    try {
      db.exec(`
        insert into projects (
          id,
          name,
          slug,
          workspace_path,
          status,
          preview_status,
          created_at,
          updated_at
        ) values (
          'project-1',
          'Project One',
          'project-one',
          '/tmp/project-one',
          'ready',
          'stopped',
          '2026-06-21T00:00:00.000Z',
          '2026-06-21T00:00:00.000Z'
        );

        insert into conversations (
          id,
          project_id,
          created_at,
          updated_at
        ) values (
          'conversation-1',
          'project-1',
          '2026-06-21T00:00:00.000Z',
          '2026-06-21T00:00:00.000Z'
        );

        insert into agent_runs (
          id,
          project_id,
          conversation_id,
          status,
          prompt,
          command,
          created_at
        ) values (
          'run-1',
          'project-1',
          'conversation-1',
          'completed',
          'Build an app',
          'codex',
          '2026-06-21T00:00:00.000Z'
        );

        insert into messages (
          id,
          conversation_id,
          role,
          content,
          agent_run_id,
          created_at
        ) values (
          'message-1',
          'conversation-1',
          'assistant',
          'Built it',
          'run-1',
          '2026-06-21T00:00:00.000Z'
        );

        delete from agent_runs where id = 'run-1';
      `);

      const messages = db
        .prepare("select id, agent_run_id from messages")
        .all() as any[];
      expect(messages).toEqual([{ id: "message-1", agent_run_id: null }]);
    } finally {
      db.close();
    }
  });

  it("migrates legacy messages tables to enforce agent run deletion behavior", () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-db-"));
    const filePath = path.join(tempDir, "app.sqlite");
    const legacyDb = new Database(filePath);
    legacyDb.exec(`
      create table projects (
        id text primary key,
        name text not null,
        slug text not null unique,
        workspace_path text not null,
        status text not null,
        preview_port integer,
        preview_status text not null,
        created_at text not null,
        updated_at text not null
      );

      create table conversations (
        id text primary key,
        project_id text not null references projects(id) on delete cascade,
        created_at text not null,
        updated_at text not null
      );

      create table messages (
        id text primary key,
        conversation_id text not null references conversations(id) on delete cascade,
        role text not null,
        content text not null,
        agent_run_id text,
        created_at text not null
      );

      create table agent_runs (
        id text primary key,
        project_id text not null references projects(id) on delete cascade,
        conversation_id text not null references conversations(id) on delete cascade,
        status text not null,
        prompt text not null,
        command text not null,
        exit_code integer,
        error_message text,
        started_at text,
        finished_at text,
        created_at text not null
      );

      insert into projects (
        id,
        name,
        slug,
        workspace_path,
        status,
        preview_status,
        created_at,
        updated_at
      ) values (
        'project-1',
        'Project One',
        'project-one',
        '/tmp/project-one',
        'ready',
        'stopped',
        '2026-06-21T00:00:00.000Z',
        '2026-06-21T00:00:00.000Z'
      );

      insert into conversations (
        id,
        project_id,
        created_at,
        updated_at
      ) values (
        'conversation-1',
        'project-1',
        '2026-06-21T00:00:00.000Z',
        '2026-06-21T00:00:00.000Z'
      );

      insert into agent_runs (
        id,
        project_id,
        conversation_id,
        status,
        prompt,
        command,
        created_at
      ) values (
        'run-1',
        'project-1',
        'conversation-1',
        'completed',
        'Build an app',
        'codex',
        '2026-06-21T00:00:00.000Z'
      );

      insert into messages (
        id,
        conversation_id,
        role,
        content,
        agent_run_id,
        created_at
      ) values (
        'message-1',
        'conversation-1',
        'assistant',
        'Built it',
        'run-1',
        '2026-06-21T00:00:00.000Z'
      );
    `);
    legacyDb.close();

    const db = openDatabase(filePath);
    try {
      const messageForeignKeys = db
        .prepare("pragma foreign_key_list(messages)")
        .all() as any[];
      expect(messageForeignKeys).toContainEqual(
        expect.objectContaining({
          from: "agent_run_id",
          table: "agent_runs",
          to: "id",
          on_delete: "SET NULL",
        }),
      );

      db.exec("delete from agent_runs where id = 'run-1'");

      const messages = db
        .prepare("select id, agent_run_id from messages")
        .all() as any[];
      expect(messages).toEqual([{ id: "message-1", agent_run_id: null }]);
    } finally {
      db.close();
    }
  });

  it("nulls orphan agent run references while migrating legacy messages", () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-db-"));
    const filePath = path.join(tempDir, "app.sqlite");
    const legacyDb = new Database(filePath);
    legacyDb.exec(`
      create table projects (
        id text primary key,
        name text not null,
        slug text not null unique,
        workspace_path text not null,
        status text not null,
        preview_port integer,
        preview_status text not null,
        created_at text not null,
        updated_at text not null
      );

      create table conversations (
        id text primary key,
        project_id text not null references projects(id) on delete cascade,
        created_at text not null,
        updated_at text not null
      );

      create table messages (
        id text primary key,
        conversation_id text not null references conversations(id) on delete cascade,
        role text not null,
        content text not null,
        agent_run_id text,
        created_at text not null
      );

      create table agent_runs (
        id text primary key,
        project_id text not null references projects(id) on delete cascade,
        conversation_id text not null references conversations(id) on delete cascade,
        status text not null,
        prompt text not null,
        command text not null,
        exit_code integer,
        error_message text,
        started_at text,
        finished_at text,
        created_at text not null
      );

      insert into projects (
        id,
        name,
        slug,
        workspace_path,
        status,
        preview_status,
        created_at,
        updated_at
      ) values (
        'project-1',
        'Project One',
        'project-one',
        '/tmp/project-one',
        'ready',
        'stopped',
        '2026-06-21T00:00:00.000Z',
        '2026-06-21T00:00:00.000Z'
      );

      insert into conversations (
        id,
        project_id,
        created_at,
        updated_at
      ) values (
        'conversation-1',
        'project-1',
        '2026-06-21T00:00:00.000Z',
        '2026-06-21T00:00:00.000Z'
      );

      insert into messages (
        id,
        conversation_id,
        role,
        content,
        agent_run_id,
        created_at
      ) values (
        'message-1',
        'conversation-1',
        'assistant',
        'Built it',
        'missing-run',
        '2026-06-21T00:00:00.000Z'
      );
    `);
    legacyDb.close();

    const db = openDatabase(filePath);
    try {
      const messages = db
        .prepare("select id, agent_run_id from messages")
        .all() as any[];
      expect(messages).toEqual([{ id: "message-1", agent_run_id: null }]);

      const foreignKeyViolations = db
        .prepare("pragma foreign_key_check")
        .all();
      expect(foreignKeyViolations).toEqual([]);
    } finally {
      db.close();
    }
  });
});
