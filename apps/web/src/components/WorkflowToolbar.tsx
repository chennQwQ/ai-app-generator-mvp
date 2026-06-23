import type { WorkflowNodeType } from "@ai-app-generator/shared";
import { workflowNodeTypes } from "@ai-app-generator/shared";

const nodeLabels: Record<string, string> = {
  user_input: "User Input",
  agent_generation: "Agent",
  shell_command: "Shell",
  http_request: "HTTP Request"
};

const nodeColors: Record<string, string> = {
  user_input: "#1f6feb",
  agent_generation: "#1a7f37",
  shell_command: "#8a6d10",
  http_request: "#0369a1"
};

interface WorkflowToolbarProps {
  onAddNode: (type: WorkflowNodeType) => void;
}

export function WorkflowToolbar({ onAddNode }: WorkflowToolbarProps) {
  const handleDragStart = (event: React.DragEvent, type: WorkflowNodeType) => {
    event.dataTransfer.setData("application/reactflow-type", type);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="workflow-toolbar">
      <div className="panel-heading compact">
        <h4>Nodes</h4>
      </div>
      <div className="toolbar-items">
        {workflowNodeTypes.map((type) => (
          <button
            key={type}
            className="toolbar-item"
            onClick={() => onAddNode(type)}
            draggable
            onDragStart={(e) => handleDragStart(e, type)}
            type="button"
          >
            <span
              className="toolbar-dot"
              style={{ background: nodeColors[type] ?? "#66717d" }}
            />
            {nodeLabels[type] ?? type}
          </button>
        ))}
      </div>
    </div>
  );
}
