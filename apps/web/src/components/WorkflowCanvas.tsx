import { useCallback, useRef } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  addEdge,
  useNodesState,
  useEdgesState
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { UserInputNode, AgentGenerationNode, ShellCommandNode } from "./nodes/WorkflowNodes";

const nodeTypes = {
  user_input: UserInputNode,
  agent_generation: AgentGenerationNode,
  shell_command: ShellCommandNode
};

interface WorkflowCanvasProps {
  nodes: Node[];
  edges: Edge[];
  onGraphChange: (nodes: Node[], edges: Edge[]) => void;
}

export function WorkflowCanvas({ nodes: initialNodes, edges: initialEdges, onGraphChange }: WorkflowCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const onGraphChangeRef = useRef(onGraphChange);
  onGraphChangeRef.current = onGraphChange;

  const handleNodesChange: OnNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);
      setNodes((currentNodes) => {
        setEdges((currentEdges) => {
          onGraphChangeRef.current(currentNodes, currentEdges);
          return currentEdges;
        });
        return currentNodes;
      });
    },
    [onNodesChange, setEdges]
  );

  const handleEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      onEdgesChange(changes);
      setEdges((currentEdges) => {
        setNodes((currentNodes) => {
          onGraphChangeRef.current(currentNodes, currentEdges);
          return currentNodes;
        });
        return currentEdges;
      });
    },
    [onEdgesChange, setNodes]
  );

  const handleConnect: OnConnect = useCallback(
    (params) => {
      setEdges((currentEdges) => {
        const nextEdges = addEdge(params, currentEdges);
        setNodes((currentNodes) => {
          onGraphChangeRef.current(currentNodes, nextEdges);
          return currentNodes;
        });
        return nextEdges;
      });
    },
    [setEdges, setNodes]
  );

  return (
    <div className="workflow-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        nodeTypes={nodeTypes}
        fitView
      >
        <Controls />
        <Background />
      </ReactFlow>
    </div>
  );
}
