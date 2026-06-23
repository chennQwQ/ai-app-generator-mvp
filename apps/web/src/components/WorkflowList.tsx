import type { WorkflowSummary } from "@ai-app-generator/shared";

interface WorkflowListProps {
  workflows: WorkflowSummary[];
  activeWorkflowId: string | null;
  onSelect: (workflowId: string) => void;
  onCreate: () => void;
  onDelete: (workflowId: string) => void;
  onRun: (workflowId: string) => void;
  isRunning: boolean;
}

export function WorkflowList({
  workflows,
  activeWorkflowId,
  onSelect,
  onCreate,
  onDelete,
  onRun,
  isRunning
}: WorkflowListProps) {
  return (
    <div className="workflow-list-panel">
      <div className="panel-heading compact">
        <h3>Workflows</h3>
        <button onClick={onCreate} type="button" disabled={isRunning}>
          + New
        </button>
      </div>
      <div className="workflow-items">
        {workflows.map((wf) => (
          <button
            key={wf.id}
            className={wf.id === activeWorkflowId ? "workflow-item active" : "workflow-item"}
            onClick={() => onSelect(wf.id)}
            type="button"
          >
            <span className="workflow-name">{wf.name}</span>
            <span className="workflow-nodes">{wf.nodeCount} nodes</span>
            <div className="workflow-item-actions">
              <button
                className="run-workflow-btn"
                onClick={(e) => { e.stopPropagation(); onRun(wf.id); }}
                type="button"
                disabled={isRunning}
              >
                Run
              </button>
              <button
                className="delete-workflow-btn"
                onClick={(e) => { e.stopPropagation(); onDelete(wf.id); }}
                type="button"
              >
                ×
              </button>
            </div>
          </button>
        ))}
        {workflows.length === 0 ? (
          <p className="empty-state">No workflows yet.</p>
        ) : null}
      </div>
    </div>
  );
}
