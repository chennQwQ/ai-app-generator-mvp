import { Handle, Position, type NodeProps } from "@xyflow/react";

export function UserInputNode({ data }: NodeProps) {
  return (
    <div className={`workflow-node user-input-node ${statusClass(data.status)}`}>
      <div className="workflow-node-header">User Input</div>
      <WorkflowNodeStatus status={data.status} />
      <div className="workflow-node-body">{String(data.prompt ?? "")}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export function AgentGenerationNode({ data }: NodeProps) {
  return (
    <div className={`workflow-node agent-generation-node ${statusClass(data.status)}`}>
      <Handle type="target" position={Position.Top} />
      <div className="workflow-node-header">Agent Generation</div>
      <WorkflowNodeStatus status={data.status} />
      <div className="workflow-node-body">{String(data.label ?? "Generate code")}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export function ShellCommandNode({ data }: NodeProps) {
  return (
    <div className={`workflow-node shell-command-node ${statusClass(data.status)}`}>
      <Handle type="target" position={Position.Top} />
      <div className="workflow-node-header">Shell Command</div>
      <WorkflowNodeStatus status={data.status} />
      <div className="workflow-node-body">{String(data.command ?? "")}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export function HttpRequestNode({ data }: NodeProps) {
  return (
    <div className={`workflow-node http-request-node ${statusClass(data.status)}`}>
      <Handle type="target" position={Position.Top} />
      <div className="workflow-node-header">HTTP Request</div>
      <WorkflowNodeStatus status={data.status} />
      <div className="workflow-node-body">{String(data.url ?? "")}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function WorkflowNodeStatus({ status }: { status: unknown }) {
  if (typeof status !== "string" || !status) return null;
  return <div className={`workflow-node-status workflow-node-status-${status}`}>{status}</div>;
}

function statusClass(status: unknown): string {
  return typeof status === "string" && status ? `workflow-node-${status}` : "";
}
