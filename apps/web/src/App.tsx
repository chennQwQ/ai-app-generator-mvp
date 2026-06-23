import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentLog,
  AgentRun,
  ChatMessage,
  FileNode,
  PreviewInfo,
  ProjectEvent,
  ProjectSummary,
  TemplateMeta,
  WorkflowDetail,
  WorkflowRun,
  WorkflowSummary
} from "@ai-app-generator/shared";
import {
  cancelRun,
  createProject,
  createWorkflow,
  deleteProject,
  deleteWorkflow,
  getFileContent,
  getFiles,
  getRunLogs,
  getWorkflow,
  listAgentRuns,
  listMessages,
  listProjects,
  listTemplates,
  listWorkflows,
  runWorkflow,
  sendMessage,
  startPreview,
  stopPreview,
  updateWorkflowGraph,
  wsBase
} from "./api";
import { Editor } from "./components/Editor";
import { ErrorBanner } from "./components/ErrorBanner";
import { LoadingSkeleton } from "./components/LoadingSkeleton";
import { WorkflowCanvas } from "./components/WorkflowCanvas";
import { WorkflowList } from "./components/WorkflowList";

const defaultPreview: PreviewInfo = {
  status: "stopped",
  port: null,
  url: null
};

export function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [prompt, setPrompt] = useState("");
  const [projectName, setProjectName] = useState("Todo App");
  const [preview, setPreview] = useState<PreviewInfo>(defaultPreview);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [showIframe, setShowIframe] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState("react-vite");
  const [availableTemplates, setAvailableTemplates] = useState<TemplateMeta[]>([]);
  const activeProjectIdRef = useRef<string | null>(null);
  const fileRequestIdRef = useRef(0);
  const logListRef = useRef<HTMLDivElement>(null);
  const [workspaceTab, setWorkspaceTab] = useState<"files" | "workflow" | "preview">("files");
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);
  const [workflowGraph, setWorkflowGraph] = useState<WorkflowDetail | null>(null);
  const [workflowRun, setWorkflowRun] = useState<WorkflowRun | null>(null);
  const [isRunningWorkflow, setIsRunningWorkflow] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, projects]
  );

  const reloadProjects = useCallback(async () => {
    const nextProjects = await listProjects();
    setProjects(nextProjects);
    setActiveProjectId((currentProjectId) => currentProjectId ?? nextProjects[0]?.id ?? null);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (logListRef.current) {
      logListRef.current.scrollTop = logListRef.current.scrollHeight;
    }
  }, [logs]);

  const reloadFiles = useCallback(async (projectId: string) => {
    const nextFiles = await getFiles(projectId);
    if (activeProjectIdRef.current === projectId) setFiles(nextFiles);
    return nextFiles;
  }, []);

  const loadWorkflows = useCallback(async () => {
    const projectId = activeProjectIdRef.current;
    if (!projectId) return;
    try {
      const wfs = await listWorkflows(projectId);
      if (activeProjectIdRef.current === projectId) setWorkflows(wfs);
    } catch {
      // workflows are optional
    }
  }, []);

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
    fileRequestIdRef.current += 1;
  }, [activeProjectId]);

  useEffect(() => {
    reloadProjects().catch((caught) => setError(errorMessage(caught)));
  }, [reloadProjects]);

  useEffect(() => {
    listTemplates().then(setAvailableTemplates).catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeProjectId) {
      setMessages([]);
      setLogs([]);
      setFiles([]);
      setRuns([]);
      setSelectedRunId(null);
      setSelectedPath(null);
      setFileContent("");
      setPreview(defaultPreview);
      setWorkflows([]);
      setActiveWorkflowId(null);
      setWorkflowGraph(null);
      setWorkflowRun(null);
      return;
    }

    let cancelled = false;
    const projectId = activeProjectId;

    async function loadProject() {
      try {
        const [nextMessages, nextFiles, nextRuns] = await Promise.all([
          listMessages(projectId),
          getFiles(projectId),
          listAgentRuns(projectId)
        ]);
        if (cancelled) return;
        setMessages(nextMessages);
        setFiles(nextFiles);
        setRuns(nextRuns);
        setLogs([]);
        setSelectedPath(null);
        setFileContent("");
        setPreview({
          status: activeProject?.previewStatus ?? "stopped",
          port: activeProject?.previewPort ?? null,
          url: activeProject?.previewUrl ?? null
        });
        loadWorkflows().catch(() => {});
      } catch (caught) {
        if (!cancelled) setError(errorMessage(caught));
      }
    }

    void loadProject();

    const socket = new WebSocket(`${wsBase}/ws?projectId=${encodeURIComponent(projectId)}`);
    socket.onmessage = (message) => {
      const event = parseProjectEvent(message.data);
      if (!event || event.projectId !== projectId) return;
      if (activeProjectIdRef.current !== projectId) return;

      if (event.type === "run.log") {
        setLogs((currentLogs) => [...currentLogs, event.log]);
      }
      if (event.type === "run.status") {
        listAgentRuns(projectId).then(setRuns).catch(() => {});
      }
      if (event.type === "files.changed") {
        reloadFiles(projectId).catch((caught) => {
          if (activeProjectIdRef.current === projectId) setError(errorMessage(caught));
        });
      }
      if (event.type === "preview.status") {
        setPreview(event.preview);
      }
      if (event.type === "error") {
        setError(event.message);
      }
      if (event.type === "workflow.run.status") {
        setWorkflowRun(event.run);
        setIsRunningWorkflow(event.run.status === "queued" || event.run.status === "running");
      }
      if (event.type === "workflow.node.status") {
        // node status updates received in real-time
      }
    };
    socket.onerror = () => {
      if (!cancelled && activeProjectIdRef.current === projectId) {
        setError("Project event stream disconnected.");
      }
    };

    return () => {
      cancelled = true;
      socket.close();
    };
  }, [
    activeProject?.previewPort,
    activeProject?.previewStatus,
    activeProject?.previewUrl,
    activeProjectId,
    reloadFiles
  ]);

  async function handleCreateProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = projectName.trim();
    if (!name) return;

    try {
      setError(null);
      const project = await createProject(name, selectedTemplate);
      setProjects((currentProjects) => [project, ...currentProjects]);
      setActiveProjectId(project.id);
      setProjectName("Todo App");
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function handleSendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const projectId = activeProjectId;
    if (!projectId) return;

    const content = prompt.trim();
    if (!content) return;

    try {
      setError(null);
      setIsSending(true);
      const response = await sendMessage(projectId, content);
      if (activeProjectIdRef.current !== projectId) return;
      setMessages((currentMessages) => [...currentMessages, response.message]);
      setPrompt("");
    } catch (caught) {
      if (activeProjectIdRef.current === projectId) setError(errorMessage(caught));
    } finally {
      setIsSending(false);
    }
  }

  async function handleSelectFile(path: string) {
    const projectId = activeProjectId;
    if (!projectId) return;
    const requestId = fileRequestIdRef.current + 1;
    fileRequestIdRef.current = requestId;

    try {
      setError(null);
      setSelectedPath(path);
      const content = await getFileContent(projectId, path);
      if (activeProjectIdRef.current !== projectId || fileRequestIdRef.current !== requestId) return;
      setFileContent(content);
    } catch (caught) {
      if (activeProjectIdRef.current !== projectId || fileRequestIdRef.current !== requestId) return;
      setError(errorMessage(caught));
      setFileContent("");
    }
  }

  async function handleStartPreview() {
    const projectId = activeProjectId;
    if (!projectId) return;

    try {
      setError(null);
      setPreview({ status: "starting", port: null, url: null });
      const nextPreview = await startPreview(projectId);
      if (activeProjectIdRef.current !== projectId) return;
      setPreview(nextPreview);
    } catch (caught) {
      if (activeProjectIdRef.current !== projectId) return;
      setError(errorMessage(caught));
      setPreview((currentPreview) => ({ ...currentPreview, status: "error" }));
    }
  }

  async function handleStopPreview() {
    const projectId = activeProjectId;
    if (!projectId) return;

    try {
      setError(null);
      const nextPreview = await stopPreview(projectId);
      if (activeProjectIdRef.current !== projectId) return;
      setPreview(nextPreview);
    } catch (caught) {
      if (activeProjectIdRef.current === projectId) setError(errorMessage(caught));
    }
  }

  async function handleSelectRun(runId: string) {
    const projectId = activeProjectId;
    if (!projectId) return;

    try {
      setSelectedRunId(runId);
      const runLogs = await getRunLogs(projectId, runId);
      if (activeProjectIdRef.current !== projectId) return;
      setLogs(runLogs);
    } catch (caught) {
      if (activeProjectIdRef.current === projectId) setError(errorMessage(caught));
    }
  }

  async function handleCancelRun(runId: string) {
    const projectId = activeProjectId;
    if (!projectId) return;

    try {
      setError(null);
      await cancelRun(projectId, runId);
    } catch (caught) {
      if (activeProjectIdRef.current === projectId) setError(errorMessage(caught));
    }
  }

  async function handleDeleteProject(projectId: string, event: React.MouseEvent) {
    event.stopPropagation();
    try {
      setError(null);
      await deleteProject(projectId);
      setProjects((current) => current.filter((p) => p.id !== projectId));
      if (activeProjectIdRef.current === projectId) {
        setActiveProjectId(null);
        setShowIframe(false);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function handleCreateWorkflow() {
    const projectId = activeProjectId;
    if (!projectId) return;
    try {
      setError(null);
      const count = workflows.length + 1;
      const wf = await createWorkflow(projectId, `Workflow ${count}`);
      setWorkflows((current) => [wf, ...current]);
      setActiveWorkflowId(wf.id);
      setWorkflowGraph(wf);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function handleSelectWorkflow(workflowId: string) {
    const projectId = activeProjectId;
    if (!projectId) return;
    try {
      setError(null);
      setActiveWorkflowId(workflowId);
      const wf = await getWorkflow(projectId, workflowId);
      setWorkflowGraph(wf);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function handleDeleteWorkflow(workflowId: string) {
    const projectId = activeProjectId;
    if (!projectId) return;
    try {
      setError(null);
      await deleteWorkflow(projectId, workflowId);
      setWorkflows((current) => current.filter((w) => w.id !== workflowId));
      if (activeWorkflowId === workflowId) {
        setActiveWorkflowId(null);
        setWorkflowGraph(null);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function handleGraphChange(nodes: unknown[], edges: unknown[]) {
    const projectId = activeProjectId;
    const workflowId = activeWorkflowId;
    if (!projectId || !workflowId) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const graph = {
          nodes: nodes.map((n: any) => ({
            id: n.id,
            type: n.type ?? "user_input",
            position: n.position,
            data: n.data ?? {}
          })),
          edges: edges.map((e: any) => ({
            id: e.id,
            source: e.source,
            target: e.target
          }))
        };
        const wf = await updateWorkflowGraph(projectId, workflowId, graph);
        setWorkflowGraph(wf);
        setWorkflows((current) =>
          current.map((w) => (w.id === workflowId ? { ...w, nodeCount: wf.nodeCount, updatedAt: wf.updatedAt } : w))
        );
      } catch {
        // best-effort auto-save
      }
    }, 800);
  }

  async function handleRunWorkflow(workflowId: string) {
    const projectId = activeProjectId;
    if (!projectId) return;
    try {
      setError(null);
      setIsRunningWorkflow(true);
      const run = await runWorkflow(projectId, workflowId);
      setWorkflowRun(run);
    } catch (caught) {
      setError(errorMessage(caught));
      setIsRunningWorkflow(false);
    }
  }

  return (
    <main className="studio-shell">
      <header className="studio-header">
        <div>
          <p className="eyebrow">AI App Generator</p>
          <h1>Studio</h1>
        </div>
        <div className="status-strip" aria-live="polite">
          <span className={`status-dot status-${preview.status}`} />
          <span>{preview.status}</span>
          {preview.url ? (
            <a href={preview.url} target="_blank" rel="noreferrer">
              {preview.url}
            </a>
          ) : null}
        </div>
      </header>

      {error ? (
        <ErrorBanner
          message={error}
          onDismiss={() => setError(null)}
          onRetry={() => reloadProjects()}
        />
      ) : null}

      <section className="studio-grid">
        <aside className="panel project-panel" aria-label="Projects">
          <div className="panel-heading">
            <h2>Projects</h2>
            <span>{projects.length}</span>
          </div>

          <form className="stack" onSubmit={handleCreateProject}>
            <label htmlFor="project-name">Project name</label>
            <div className="inline-form">
              <input
                id="project-name"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
              />
              <button type="submit">Create Project</button>
            </div>
            {availableTemplates.length > 0 ? (
              <select
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                className="template-select"
                aria-label="Template"
              >
                {availableTemplates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            ) : null}
          </form>

          <div className="project-list" role="list">
            {isLoading ? (
              <LoadingSkeleton lines={3} />
            ) : (
              projects.map((project) => (
              <button
                className={project.id === activeProjectId ? "project-item active" : "project-item"}
                key={project.id}
                onClick={() => setActiveProjectId(project.id)}
                type="button"
              >
                <span>{project.name}</span>
                <small>
                  {project.status} / {project.previewStatus}
                </small>
                <span
                  className="delete-project-btn"
                  onClick={(event) => handleDeleteProject(project.id, event)}
                  role="button"
                  aria-label="Delete project"
                >
                  ×
                </span>
              </button>
            ))
          )}
            {projects.length === 0 && !isLoading ? <p className="empty-state">No projects yet.</p> : null}
          </div>
        </aside>

        <section className="panel conversation-panel" aria-label="Conversation">
          <div className="panel-heading">
            <h2>{activeProject?.name ?? "Conversation"}</h2>
            <span>{messages.length} messages</span>
          </div>

          <div className="message-list" aria-live="polite">
            {messages.map((message) => (
              <article className={`message message-${message.role}`} key={message.id}>
                <span>{message.role}</span>
                <p>{message.content}</p>
              </article>
            ))}
            {messages.length === 0 ? (
              <p className="empty-state">Send a prompt to start generating this app.</p>
            ) : null}
          </div>

          <form className="prompt-form" onSubmit={handleSendMessage}>
            <label htmlFor="prompt">Prompt</label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe the next change..."
              rows={5}
            />
            <button disabled={!activeProjectId || isSending} type="submit">
              {isSending ? "Sending..." : "Send"}
            </button>
          </form>
        </section>

        <section className="panel workspace-panel" aria-label="Workspace">
          <div className="panel-heading">
            <h2>Workspace</h2>
            {workspaceTab !== "preview" && (
              preview.status === "running" ? (
                <button disabled={!activeProjectId} onClick={handleStopPreview} type="button">
                  Stop Preview
                </button>
              ) : (
                <button disabled={!activeProjectId || preview.status === "starting"} onClick={handleStartPreview} type="button">
                  Start Preview
                </button>
              )
            )}
            {workspaceTab === "preview" && preview.status === "running" ? (
              <button disabled={!activeProjectId} onClick={handleStopPreview} type="button">
                Stop Preview
              </button>
            ) : null}
            {workspaceTab === "preview" && preview.status !== "running" ? (
              <button disabled={!activeProjectId || preview.status === "starting"} onClick={handleStartPreview} type="button">
                Start Preview
              </button>
            ) : null}
          </div>

          <div className="workspace-tabs">
            <button
              className={workspaceTab === "files" ? "tab active" : "tab"}
              onClick={() => setWorkspaceTab("files")}
              type="button"
            >
              Files
            </button>
            <button
              className={workspaceTab === "workflow" ? "tab active" : "tab"}
              onClick={() => { setWorkspaceTab("workflow"); loadWorkflows(); }}
              type="button"
            >
              Workflow
            </button>
            <button
              className={workspaceTab === "preview" ? "tab active" : "tab"}
              onClick={() => setWorkspaceTab("preview")}
              type="button"
            >
              Preview
            </button>
          </div>

          {workspaceTab === "files" && (
            <>
              <div className="workspace-layout">
                <nav className="file-tree" aria-label="Files">
                  {files.length > 0 ? (
                    <FileTree nodes={files} selectedPath={selectedPath} onSelect={handleSelectFile} />
                  ) : (
                    <p className="empty-state">No files yet.</p>
                  )}
                </nav>

                <div className="file-viewer">
                  <div className="file-title">{selectedPath ?? "Select a file"}</div>
                  {selectedPath && fileContent ? (
                    <Editor value={fileContent} path={selectedPath} />
                  ) : (
                    <pre>File content will appear here.</pre>
                  )}
                </div>
              </div>

              <section className="run-history" aria-label="Run history">
                <div className="panel-heading compact">
                  <h3>Run History</h3>
                  <span>{runs.length}</span>
                </div>
                <div className="run-list">
                  {runs.map((run) => (
                    <button
                      className={run.id === selectedRunId ? "run-item active" : "run-item"}
                      key={run.id}
                      onClick={() => handleSelectRun(run.id)}
                      type="button"
                    >
                      <span className={`status-dot status-${run.status}`} />
                      <span className="run-summary">{run.prompt.slice(0, 60)}{run.prompt.length > 60 ? "…" : ""}</span>
                      <small className="run-status">{run.status}</small>
                      {(run.status === "queued" || run.status === "running") ? (
                        <button
                          className="cancel-run-btn"
                          onClick={(e) => { e.stopPropagation(); handleCancelRun(run.id); }}
                          type="button"
                        >
                          Cancel
                        </button>
                      ) : null}
                    </button>
                  ))}
                  {runs.length === 0 ? <p className="empty-state">No runs yet.</p> : null}
                </div>
              </section>

              <section className="log-panel" aria-label="Run logs">
                <div className="panel-heading compact">
                  <h3>Logs{selectedRunId ? " (historical)" : " (live)"}</h3>
                  <span>{logs.length}</span>
                </div>
                <div className="log-list" ref={logListRef}>
                  {logs.map((log) => (
                    <code className={`log-line log-${log.stream}`} key={log.id}>
                      {log.content}
                    </code>
                  ))}
                  {logs.length === 0 ? <p className="empty-state">No run logs yet.</p> : null}
                </div>
              </section>
            </>
          )}

          {workspaceTab === "workflow" && activeProjectId && (
            <div className="workflow-tab-content">
              <WorkflowList
                workflows={workflows}
                activeWorkflowId={activeWorkflowId}
                onSelect={handleSelectWorkflow}
                onCreate={handleCreateWorkflow}
                onDelete={handleDeleteWorkflow}
                onRun={handleRunWorkflow}
                isRunning={isRunningWorkflow}
              />
              {workflowGraph ? (
                <>
                  <WorkflowCanvas
                    nodes={workflowGraph.graph.nodes.map((n) => ({
                      id: n.id,
                      type: n.type,
                      position: n.position,
                      data: n.data
                    }))}
                    edges={workflowGraph.graph.edges.map((e) => ({
                      id: e.id,
                      source: e.source,
                      target: e.target
                    }))}
                    onGraphChange={handleGraphChange}
                  />
                  {workflowRun ? (
                    <div className="workflow-run-status">
                      <span className={`status-dot status-${workflowRun.status}`} />
                      <span>Workflow: {workflowRun.status}</span>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="empty-state">Select or create a workflow to begin.</p>
              )}
            </div>
          )}

          {workspaceTab === "workflow" && !activeProjectId && (
            <p className="empty-state">Select a project first.</p>
          )}

          {workspaceTab === "preview" && (
            <>
              {preview.status === "running" ? (
                <button className="show-preview-btn" onClick={() => setShowIframe((v) => !v)} type="button">
                  {showIframe ? "Hide Preview" : "Show Preview"}
                </button>
              ) : null}
              {showIframe && preview.url ? (
                <iframe className="preview-iframe" src={preview.url} title="Preview" />
              ) : null}
              {preview.status !== "running" ? (
                <p className="empty-state">Preview is not running. Click Start Preview to begin.</p>
              ) : null}
            </>
          )}
        </section>
      </section>
    </main>
  );
}

interface FileTreeProps {
  nodes: FileNode[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

function FileTree({ nodes, selectedPath, onSelect }: FileTreeProps) {
  return (
    <ul>
      {nodes.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}

interface FileTreeNodeProps {
  node: FileNode;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

function FileTreeNode({ node, selectedPath, onSelect }: FileTreeNodeProps) {
  const isDirectory = node.type === "directory";

  return (
    <li>
      <button
        className={node.path === selectedPath ? "file-node active" : "file-node"}
        disabled={isDirectory}
        onClick={() => onSelect(node.path)}
        type="button"
      >
        <span aria-hidden="true">{isDirectory ? "/" : "-"}</span>
        {node.name}
      </button>
      {isDirectory && node.children?.length ? (
        <FileTree nodes={node.children} selectedPath={selectedPath} onSelect={onSelect} />
      ) : null}
    </li>
  );
}

function parseProjectEvent(data: string): ProjectEvent | null {
  try {
    return JSON.parse(data) as ProjectEvent;
  } catch {
    return null;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}
