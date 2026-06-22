import type Database from "better-sqlite3";

type ForeignKeyRow = {
  from: string;
  table: string;
  to: string;
  on_delete: string;
};

type TableRow = {
  name: string;
};

export function migrate(db: Database.Database) {
  db.exec(`
    create table if not exists projects (
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

    create table if not exists conversations (
      id text primary key,
      project_id text not null references projects(id) on delete cascade,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists messages (
      id text primary key,
      conversation_id text not null references conversations(id) on delete cascade,
      role text not null,
      content text not null,
      agent_run_id text references agent_runs(id) on delete set null,
      created_at text not null
    );

    create table if not exists agent_runs (
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

    create table if not exists agent_logs (
      id text primary key,
      agent_run_id text not null references agent_runs(id) on delete cascade,
      stream text not null,
      content text not null,
      sequence integer not null,
      created_at text not null
    );

    create table if not exists audit_logs (
      id text primary key,
      project_id text not null references projects(id) on delete cascade,
      run_id text not null references agent_runs(id) on delete cascade,
      tool_name text not null,
      parameters text not null,
      exit_code integer,
      output text,
      created_at text not null
    );
  `);

  migrateMessagesAgentRunForeignKey(db);

  db.exec(`
    create index if not exists idx_conversations_project_id on conversations(project_id);
    create index if not exists idx_messages_conversation_id on messages(conversation_id);
    create index if not exists idx_messages_agent_run_id on messages(agent_run_id);
    create index if not exists idx_agent_runs_project_id on agent_runs(project_id);
    create index if not exists idx_agent_logs_run_sequence on agent_logs(agent_run_id, sequence);
    create index if not exists idx_audit_logs_project_id on audit_logs(project_id);
    create index if not exists idx_audit_logs_run_id on audit_logs(run_id);
  `);
}

function migrateMessagesAgentRunForeignKey(db: Database.Database) {
  if (hasMessagesAgentRunForeignKey(db)) return;

  const foreignKeys = db.prepare("pragma foreign_keys").all()[0] as
    | { foreign_keys: number }
    | undefined;

  db.pragma("foreign_keys = OFF");

  try {
    db.transaction(() => {
      const existingMessagesNew = db
        .prepare("select name from sqlite_master where type = 'table' and name = ?")
        .all("messages_new") as TableRow[];

      if (existingMessagesNew.length > 0) {
        throw new Error(
          "Cannot migrate messages table while leftover messages_new table exists",
        );
      }

      db.exec(`
        create table messages_new (
          id text primary key,
          conversation_id text not null references conversations(id) on delete cascade,
          role text not null,
          content text not null,
          agent_run_id text references agent_runs(id) on delete set null,
          created_at text not null
        );

        insert into messages_new (
          id,
          conversation_id,
          role,
          content,
          agent_run_id,
          created_at
        )
        select
          messages.id,
          messages.conversation_id,
          messages.role,
          messages.content,
          case
            when messages.agent_run_id is null or agent_runs.id is not null
              then messages.agent_run_id
            else null
          end,
          messages.created_at
        from messages
        left join agent_runs on agent_runs.id = messages.agent_run_id;

        drop table messages;
        alter table messages_new rename to messages;
      `);
    })();
  } finally {
    db.pragma(`foreign_keys = ${foreignKeys?.foreign_keys ? "ON" : "OFF"}`);
  }
}

function hasMessagesAgentRunForeignKey(db: Database.Database) {
  const foreignKeys = db
    .prepare("pragma foreign_key_list(messages)")
    .all() as ForeignKeyRow[];

  return foreignKeys.some(
    (foreignKey) =>
      foreignKey.from === "agent_run_id" &&
      foreignKey.table === "agent_runs" &&
      foreignKey.to === "id" &&
      foreignKey.on_delete === "SET NULL",
  );
}
