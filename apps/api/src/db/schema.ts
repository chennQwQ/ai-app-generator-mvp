import type Database from "better-sqlite3";

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

    create index if not exists idx_conversations_project_id on conversations(project_id);
    create index if not exists idx_messages_conversation_id on messages(conversation_id);
    create index if not exists idx_messages_agent_run_id on messages(agent_run_id);
    create index if not exists idx_agent_runs_project_id on agent_runs(project_id);
    create index if not exists idx_agent_logs_run_sequence on agent_logs(agent_run_id, sequence);
  `);
}
