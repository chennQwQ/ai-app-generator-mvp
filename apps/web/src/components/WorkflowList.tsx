import { useState } from "react";
import type { WorkflowSummary } from "@ai-app-generator/shared";

interface WorkflowListProps {
  workflows: WorkflowSummary[];
  activeWorkflowId: string | null;
  onSelect: (workflowId: string) => void;
  onCreate: () => void;
  onDelete: (workflowId: string) => void;
  onRun: (workflowId: string) => void;
  onRename: (workflowId: string, name: string) => void;
  isRunning: boolean;
}

export function WorkflowList({
  workflows,
  activeWorkflowId,
  onSelect,
  onCreate,
  onDelete,
  onRun,
  onRename,
  isRunning
}: WorkflowListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  function handleStartRename(wf: WorkflowSummary) {
    setEditingId(wf.id);
    setEditName(wf.name);
  }

  function handleSubmitRename() {
    if (editingId && editName.trim()) {
      onRename(editingId, editName.trim());
    }
    setEditingId(null);
    setEditName("");
  }

  function handleCancelRename() {
    setEditingId(null);
    setEditName("");
  }

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
            {editingId === wf.id ? (
              <input
                className="workflow-rename-input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmitRename();
                  if (e.key === "Escape") handleCancelRename();
                }}
                onBlur={handleSubmitRename}
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="workflow-name" onDoubleClick={() => handleStartRename(wf)}>{wf.name}</span>
            )}
            <span className="workflow-nodes">{wf.nodeCount} nodes</span>
            <div className="workflow-item-actions">
              {editingId !== wf.id && (
                <button
                  className="rename-workflow-btn"
                  onClick={(e) => { e.stopPropagation(); handleStartRename(wf); }}
                  type="button"
                  title="Rename"
                >
                  ✎
                </button>
              )}
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
