import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentLog,
  AgentRun,
  ChatMessage,
  FileNode,
  PreviewInfo,
  ProjectEvent,
  ProjectSummary
} from "@ai-app-generator/shared";
import {
  cancelRun,
  createProject,
  deleteProject,
  getFileContent,
  getFiles,
  getRunLogs,
  listAgentRuns,
  listMessages,
  listProjects,
  sendMessage,
  startPreview,
  stopPreview,
  wsBase
} from "./api";

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
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const activeProjectIdRef = useRef<string | null>(null);
  const fileRequestIdRef = useRef(0);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, projects]
  );

  const reloadProjects = useCallback(async () => {
    const nextProjects = await listProjects();
    setProjects(nextProjects);
    setActiveProjectId((currentProjectId) => currentProjectId ?? nextProjects[0]?.id ?? null);
  }, []);

  const reloadFiles = useCallback(async (projectId: string) => {
    const nextFiles = await getFiles(projectId);
    if (activeProjectIdRef.current === projectId) setFiles(nextFiles);
    return nextFiles;
  }, []);

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
    fileRequestIdRef.current += 1;
  }, [activeProjectId]);

  useEffect(() => {
    reloadProjects().catch((caught) => setError(errorMessage(caught)));
  }, [reloadProjects]);

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
      const project = await createProject(name);
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
      }
    } catch (caught) {
      setError(errorMessage(caught));
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
        <div className="error-banner" role="alert">
          {error}
        </div>
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
          </form>

          <div className="project-list" role="list">
            {projects.map((project) => (
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
            ))}
            {projects.length === 0 ? <p className="empty-state">No projects yet.</p> : null}
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
            {preview.status === "running" ? (
              <button disabled={!activeProjectId} onClick={handleStopPreview} type="button">
                Stop Preview
              </button>
            ) : (
              <button disabled={!activeProjectId || preview.status === "starting"} onClick={handleStartPreview} type="button">
                Start Preview
              </button>
            )}
          </div>

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
              <pre>{fileContent || "File content will appear here."}</pre>
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
            <div className="log-list">
              {logs.map((log) => (
                <code className={`log-line log-${log.stream}`} key={log.id}>
                  {log.content}
                </code>
              ))}
              {logs.length === 0 ? <p className="empty-state">No run logs yet.</p> : null}
            </div>
          </section>
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
