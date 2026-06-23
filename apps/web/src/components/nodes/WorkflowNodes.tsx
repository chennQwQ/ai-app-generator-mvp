import { Handle, Position, type NodeProps } from "@xyflow/react";

export function UserInputNode({ data }: NodeProps) {
  return (
    <div className="workflow-node user-input-node">
      <div className="workflow-node-header">User Input</div>
      <div className="workflow-node-body">{String(data.prompt ?? "")}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export function AgentGenerationNode({ data }: NodeProps) {
  return (
    <div className="workflow-node agent-generation-node">
      <Handle type="target" position={Position.Top} />
      <div className="workflow-node-header">Agent Generation</div>
      <div className="workflow-node-body">{String(data.label ?? "Generate code")}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export function ShellCommandNode({ data }: NodeProps) {
  return (
    <div className="workflow-node shell-command-node">
      <Handle type="target" position={Position.Top} />
      <div className="workflow-node-header">Shell Command</div>
      <div className="workflow-node-body">{String(data.command ?? "")}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
