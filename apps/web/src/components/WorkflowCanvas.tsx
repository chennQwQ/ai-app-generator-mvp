import { useCallback, useEffect, useRef } from "react";
import type { WorkflowNodeType } from "@ai-app-generator/shared";
import {
  ReactFlow,
  Controls,
  Background,
  useReactFlow,
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
import { UserInputNode, AgentGenerationNode, ShellCommandNode, HttpRequestNode } from "./nodes/WorkflowNodes";
import { nanoid } from "nanoid";

const nodeTypes = {
  user_input: UserInputNode,
  agent_generation: AgentGenerationNode,
  shell_command: ShellCommandNode,
  http_request: HttpRequestNode
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
  const { screenToFlowPosition } = useReactFlow();

  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

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

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/reactflow-type") as WorkflowNodeType;
      if (!type) return;

      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const newNode: Node = { id: nanoid(), type, position, data: {} };
      setNodes((currentNodes) => {
        const nextNodes = [...currentNodes, newNode];
        setEdges((currentEdges) => {
          onGraphChangeRef.current(nextNodes, currentEdges);
          return currentEdges;
        });
        return nextNodes;
      });
    },
    [screenToFlowPosition, setNodes, setEdges]
  );

  return (
    <div className="workflow-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        nodeTypes={nodeTypes}
        fitView
        deleteKeyCode={["Backspace", "Delete"]}
        onNodesDelete={(deletedNodes) => {
          setEdges((currentEdges) => {
            const deletedIds = new Set(deletedNodes.map((n) => n.id));
            const nextEdges = currentEdges.filter((e) => !deletedIds.has(e.source) && !deletedIds.has(e.target));
            setNodes((currentNodes) => {
              onGraphChangeRef.current(currentNodes, nextEdges);
              return currentNodes;
            });
            return nextEdges;
          });
        }}
      >
        <Controls />
        <Background />
      </ReactFlow>
    </div>
  );
}
