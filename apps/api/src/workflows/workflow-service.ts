import { nanoid } from "nanoid";
import type Database from "better-sqlite3";
import { workflowNodeTypes, type WorkflowGraph, type WorkflowNodeType, type WorkflowSummary, type WorkflowDetail } from "@ai-app-generator/shared";

export class WorkflowNotFoundError extends Error {
  constructor(id: string) {
    super(`Workflow not found: ${id}`);
    this.name = "WorkflowNotFoundError";
  }
}

export class DuplicateWorkflowNameError extends Error {
  constructor(name: string) {
    super(`Workflow with name "${name}" already exists in this project`);
    this.name = "DuplicateWorkflowNameError";
  }
}

export class InvalidWorkflowGraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWorkflowGraphError";
  }
}

const emptyGraph: WorkflowGraph = { nodes: [], edges: [] };

export class WorkflowService {
  constructor(private readonly db: Database.Database) {}

  createWorkflow(projectId: string, name: string): WorkflowDetail {
    const existing = this.db.prepare(
      "select 1 from workflows where project_id = ? and name = ? limit 1"
    ).get(projectId, name);
    if (existing) throw new DuplicateWorkflowNameError(name);

    const now = new Date().toISOString();
    const id = nanoid();
    const graph = JSON.stringify(emptyGraph);

    this.db.prepare(`
      insert into workflows (id, project_id, name, graph, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?)
    `).run(id, projectId, name, graph, now, now);

    return this.getWorkflow(id);
  }

  listWorkflows(projectId: string): WorkflowSummary[] {
    return this.db.prepare(
      "select * from workflows where project_id = ? order by created_at desc"
    ).all(projectId).map((row) => this.mapRow(row));
  }

  getWorkflow(id: string): WorkflowDetail {
    const row = this.db.prepare("select * from workflows where id = ?").get(id);
    if (!row) throw new WorkflowNotFoundError(id);
    return this.mapRow(row);
  }

  getWorkflowForProject(projectId: string, workflowId: string): WorkflowDetail {
    const row = this.db.prepare("select * from workflows where id = ? and project_id = ?").get(workflowId, projectId);
    if (!row) throw new WorkflowNotFoundError(workflowId);
    return this.mapRow(row);
  }

  updateGraph(id: string, graph: WorkflowGraph): WorkflowDetail {
    const row = this.db.prepare("select id from workflows where id = ?").get(id);
    if (!row) throw new WorkflowNotFoundError(id);

    this.validateGraph(graph);

    const now = new Date().toISOString();
    this.db.prepare("update workflows set graph = ?, updated_at = ? where id = ?")
      .run(JSON.stringify(graph), now, id);

    return this.getWorkflow(id);
  }

  deleteWorkflow(id: string): void {
    const result = this.db.prepare("delete from workflows where id = ?").run(id);
    if (result.changes === 0) throw new WorkflowNotFoundError(id);
  }

  private validateGraph(graph: WorkflowGraph): void {
    const nodeIds = new Set(graph.nodes.map((n) => n.id));

    if (graph.nodes.length === 0 && graph.edges.length === 0) return;

    for (const node of graph.nodes) {
      if (!node.id) throw new InvalidWorkflowGraphError("Each node must have an id");
      if (!node.type) throw new InvalidWorkflowGraphError("Each node must have a type");
      if (!(workflowNodeTypes as readonly string[]).includes(node.type)) {
        throw new InvalidWorkflowGraphError(`Unknown node type: ${node.type}`);
      }
      if (!node.position || typeof node.position.x !== "number" || typeof node.position.y !== "number") {
        throw new InvalidWorkflowGraphError(`Node ${node.id} must have a valid position`);
      }
    }

    for (const edge of graph.edges) {
      if (edge.source === edge.target) {
        throw new InvalidWorkflowGraphError(`Self-loops are not allowed: ${edge.source}`);
      }
      if (!nodeIds.has(edge.source)) {
        throw new InvalidWorkflowGraphError(`Edge references unknown source node: ${edge.source}`);
      }
      if (!nodeIds.has(edge.target)) {
        throw new InvalidWorkflowGraphError(`Edge references unknown target node: ${edge.target}`);
      }
    }
  }

  private mapRow(row: any): WorkflowDetail {
    const graph = typeof row.graph === "string" ? (JSON.parse(row.graph) as WorkflowGraph) : emptyGraph;
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      nodeCount: graph.nodes.length,
      graph,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
