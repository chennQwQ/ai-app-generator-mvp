import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ApiFlowExternalEvent, ApiFlowExternalRun, ApiFlowRunInput, WorkflowDetail } from "@ai-app-generator/shared";
import { afterEach, describe, expect, it } from "vitest";
import { ApiFlowBridge } from "../src/apiflow/apiflow-bridge.js";
import type { ApiFlowRuntimeAdapter } from "../src/apiflow/apiflow-adapter.js";
import { openDatabase } from "../src/db/database.js";
import { EventBus } from "../src/events/event-bus.js";

let tempDir: string | undefined;
let db: ReturnType<typeof openDatabase> | undefined;

afterEach(() => {
  db?.close();
  db = undefined;
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe("ApiFlowBridge", () => {
  it("polls sidecar node events and publishes workflow node statuses", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-apiflow-bridge-"));
    db = openDatabase(path.join(tempDir, "app.sqlite"));
    const bus = new EventBus();
    const events: Array<{ nodeId: string; status: string }> = [];
    const adapter = new EventingAdapter();
    const bridge = new ApiFlowBridge(db, bus, adapter, undefined, 1, 10);
    const workflow = seedWorkflow(db);
    bus.subscribe(workflow.projectId, (event) => {
      if (event.type === "workflow.node.status") {
        events.push({ nodeId: event.nodeId, status: event.status });
      }
    });

    await bridge.startRun(workflow);
    await waitFor(() => events.length > 0);

    expect(adapter.eventPolls[0]).toEqual({ externalRunId: "external-1", afterSequence: 0 });
    expect(adapter.eventPolls).toContainEqual({ externalRunId: "external-1", afterSequence: 1 });
    expect(events).toEqual([{ nodeId: "node-parse-request", status: "running" }]);
  });

  it("does not fail the workflow run when optional sidecar event polling fails", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "ai-generator-apiflow-bridge-"));
    db = openDatabase(path.join(tempDir, "app.sqlite"));
    const bus = new EventBus();
    const runs: string[] = [];
    const adapter = new FailingEventsAdapter();
    const bridge = new ApiFlowBridge(db, bus, adapter, undefined, 1, 10);
    const workflow = seedWorkflow(db);
    bus.subscribe(workflow.projectId, (event) => {
      if (event.type === "workflow.run.status") runs.push(event.run.status);
    });

    await bridge.startRun(workflow);
    await waitFor(() => runs.includes("succeeded"));

    expect(runs).not.toContain("failed");
  });
});

class EventingAdapter implements ApiFlowRuntimeAdapter {
  eventPolls: Array<{ externalRunId: string; afterSequence: number }> = [];
  private runPolls = 0;
  private eventsDelivered = false;

  async exportWorkflow(): Promise<never> {
    throw new Error("not used");
  }

  async startRun(input: ApiFlowRunInput): Promise<ApiFlowExternalRun> {
    return {
      externalRunId: "external-1",
      workflowId: input.workflowId,
      status: "running",
      result: null,
      error: null,
      startedAt: "2026-06-29T00:00:00.000Z",
      finishedAt: null,
      createdAt: "2026-06-29T00:00:00.000Z"
    };
  }

  async getRun(externalRunId: string): Promise<ApiFlowExternalRun> {
    this.runPolls += 1;
    return {
      externalRunId,
      workflowId: "workflow-1",
      status: this.runPolls > 1 ? "succeeded" : "running",
      result: null,
      error: null,
      startedAt: "2026-06-29T00:00:00.000Z",
      finishedAt: this.runPolls > 1 ? "2026-06-29T00:00:01.000Z" : null,
      createdAt: "2026-06-29T00:00:00.000Z"
    };
  }

  async getEvents(externalRunId: string, afterSequence: number): Promise<ApiFlowExternalEvent[]> {
    this.eventPolls.push({ externalRunId, afterSequence });
    if (this.eventsDelivered) return [];
    this.eventsDelivered = true;
    return [
      {
        sequence: 1,
        externalRunId,
        type: "task.running",
        nodeId: "node-parse-request",
        taskId: "task_parse_request",
        status: "running",
        message: null,
        at: "2026-06-29T00:00:00.000Z",
        payload: { taskId: "task_parse_request" }
      }
    ];
  }

  async cancelRun(): Promise<void> {}

  async healthCheck(): Promise<{ ok: boolean }> {
    return { ok: true };
  }
}

class FailingEventsAdapter extends EventingAdapter {
  override async getEvents(): Promise<ApiFlowExternalEvent[]> {
    throw new Error("events endpoint unavailable");
  }
}

function seedWorkflow(db: ReturnType<typeof openDatabase>): WorkflowDetail {
  const now = "2026-06-29T00:00:00.000Z";
  const graph = {
    nodes: [
      {
        id: "node-parse-request",
        type: "user_input" as const,
        position: { x: 0, y: 0 },
        data: { prompt: "hello" }
      }
    ],
    edges: []
  };
  db.prepare(`
    insert into projects (
      id, name, slug, workspace_path, status, preview_port, preview_status, created_at, updated_at
    )
    values ('project-1', 'Project', 'project', ?, 'created', null, 'stopped', ?, ?)
  `).run(path.join(tempDir ?? "", "workspace"), now, now);
  db.prepare(`
    insert into workflows (id, project_id, name, graph, created_at, updated_at)
    values ('workflow-1', 'project-1', 'Generated Workflow', ?, ?, ?)
  `).run(JSON.stringify(graph), now, now);

  return {
    id: "workflow-1",
    projectId: "project-1",
    name: "Generated Workflow",
    nodeCount: 1,
    createdAt: now,
    updatedAt: now,
    graph
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for condition");
}
