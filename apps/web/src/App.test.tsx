import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onopen: (() => void) | null = null;

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  close() {
    this.onclose?.();
  }
}

describe("App", () => {
  let responseOverrides: Map<string, (url: string) => Promise<Response> | Response>;

  beforeEach(() => {
    MockWebSocket.instances = [];
    responseOverrides = new Map();
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
        const url = String(input);
        const pathname = new URL(url).pathname;

        const override = responseOverrides.get(pathname);
        if (override) return override(url);

        if (url.endsWith("/api/projects")) {
          return jsonResponse([
            {
              id: "project-1",
              name: "Demo Project",
              slug: "demo-project",
              status: "ready",
              previewStatus: "stopped",
              previewPort: null,
              previewUrl: null,
              createdAt: "2026-06-22T00:00:00.000Z",
              updatedAt: "2026-06-22T00:00:00.000Z"
            },
            {
              id: "project-2",
              name: "Second Project",
              slug: "second-project",
              status: "ready",
              previewStatus: "stopped",
              previewPort: null,
              previewUrl: null,
              createdAt: "2026-06-22T00:00:00.000Z",
              updatedAt: "2026-06-22T00:00:00.000Z"
            }
          ]);
        }

        if (url.endsWith("/api/projects/project-1/messages")) {
          return jsonResponse([]);
        }

        if (url.endsWith("/api/projects/project-1/files")) {
          return jsonResponse([]);
        }

        if (url.endsWith("/api/projects/project-2/messages")) {
          return jsonResponse([]);
        }

        if (url.endsWith("/api/projects/project-2/files")) {
          return jsonResponse([]);
        }

        if (url.endsWith("/api/projects/project-1/runs")) {
          return jsonResponse([]);
        }

        if (url.endsWith("/api/projects/project-2/runs")) {
          return jsonResponse([]);
        }

        return jsonResponse({ message: "Unhandled test URL" }, 404);
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the studio shell controls without calling a real API", async () => {
    render(<App />);

    expect(
      await screen.findByRole("heading", { level: 2, name: "Demo Project" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create project/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start preview/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /prompt/i })).toBeInTheDocument();
    expect(screen.getByText(/No files yet/i)).toBeInTheDocument();
  });

  it("does not show stale file content after switching projects during a file request", async () => {
    const firstProjectFilesPath = "/api/projects/project-1/files";
    const firstProjectContentPath = "/api/projects/project-1/files/content";
    const pendingContent = deferred<Response>();

    responseOverrides.set(firstProjectFilesPath, () =>
      jsonResponse([{ name: "App.tsx", path: "src/App.tsx", type: "file" }])
    );
    responseOverrides.set(firstProjectContentPath, () => pendingContent.promise);

    render(<App />);

    const workspace = await screen.findByRole("region", { name: /workspace/i });
    fireEvent.click(await within(workspace).findByRole("button", { name: /app\.tsx/i }));
    fireEvent.click(await screen.findByRole("button", { name: /second project/i }));

    await act(async () => {
      pendingContent.resolve(jsonResponse({ content: "stale first project content" }));
      await pendingContent.promise;
    });

    expect(await screen.findByText(/No files yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/stale first project content/i)).not.toBeInTheDocument();
  });

  it("does not show stale file content after switching away and back to the same project", async () => {
    const firstProjectFilesPath = "/api/projects/project-1/files";
    const firstProjectContentPath = "/api/projects/project-1/files/content";
    const pendingContent = deferred<Response>();

    responseOverrides.set(firstProjectFilesPath, () =>
      jsonResponse([{ name: "App.tsx", path: "src/App.tsx", type: "file" }])
    );
    responseOverrides.set(firstProjectContentPath, () => pendingContent.promise);

    render(<App />);

    const workspace = await screen.findByRole("region", { name: /workspace/i });
    fireEvent.click(await within(workspace).findByRole("button", { name: /app\.tsx/i }));
    fireEvent.click(await screen.findByRole("button", { name: /second project/i }));
    await screen.findByRole("heading", { level: 2, name: "Second Project" });
    fireEvent.click(await screen.findByRole("button", { name: /demo project/i }));
    await screen.findByRole("heading", { level: 2, name: "Demo Project" });

    await act(async () => {
      pendingContent.resolve(jsonResponse({ content: "stale first project content" }));
      await pendingContent.promise;
    });

    expect(screen.queryByText(/stale first project content/i)).not.toBeInTheDocument();
    expect(screen.getByText(/File content will appear here/i)).toBeInTheDocument();
  });

  it("does not show stale file content after selecting another file in the same project", async () => {
    const firstProjectFilesPath = "/api/projects/project-1/files";
    const firstProjectContentPath = "/api/projects/project-1/files/content";
    const pendingFirstFile = deferred<Response>();

    responseOverrides.set(firstProjectFilesPath, () =>
      jsonResponse([
        { name: "First.tsx", path: "src/First.tsx", type: "file" },
        { name: "Second.tsx", path: "src/Second.tsx", type: "file" }
      ])
    );
    responseOverrides.set(firstProjectContentPath, (url) => {
      const path = new URL(url).searchParams.get("path");
      if (path === "src/First.tsx") return pendingFirstFile.promise;
      return jsonResponse({ content: "fresh second file content" });
    });

    render(<App />);

    const workspace = await screen.findByRole("region", { name: /workspace/i });
    fireEvent.click(await within(workspace).findByRole("button", { name: /first\.tsx/i }));
    fireEvent.click(await within(workspace).findByRole("button", { name: /second\.tsx/i }));
    expect(await screen.findByText(/fresh second file content/i)).toBeInTheDocument();

    await act(async () => {
      pendingFirstFile.resolve(jsonResponse({ content: "stale first file content" }));
      await pendingFirstFile.promise;
    });

    expect(screen.queryByText(/stale first file content/i)).not.toBeInTheDocument();
    expect(screen.getByText(/fresh second file content/i)).toBeInTheDocument();
  });

  it("does not overwrite files from a stale websocket reload after switching projects", async () => {
    const firstProjectFilesPath = "/api/projects/project-1/files";
    const staleFiles = deferred<Response>();
    let firstFilesCallCount = 0;

    responseOverrides.set(firstProjectFilesPath, () => {
      firstFilesCallCount += 1;
      if (firstFilesCallCount === 1) return jsonResponse([]);
      return staleFiles.promise;
    });

    render(<App />);

    await screen.findByRole("heading", { level: 2, name: "Demo Project" });
    MockWebSocket.instances[0]?.onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify({ type: "files.changed", projectId: "project-1" })
      })
    );
    fireEvent.click(await screen.findByRole("button", { name: /second project/i }));

    await act(async () => {
      staleFiles.resolve(
        jsonResponse([{ name: "Stale.tsx", path: "src/Stale.tsx", type: "file" }])
      );
      await staleFiles.promise;
    });

    expect(await screen.findByText(/No files yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /stale\.tsx/i })).not.toBeInTheDocument();
  });

  it("does not apply stale preview events from an old websocket after switching projects", async () => {
    render(<App />);

    await screen.findByRole("heading", { level: 2, name: "Demo Project" });
    const firstSocket = MockWebSocket.instances[0];
    fireEvent.click(await screen.findByRole("button", { name: /second project/i }));
    await screen.findByRole("heading", { level: 2, name: "Second Project" });

    await act(async () => {
      firstSocket?.onmessage?.(
        new MessageEvent("message", {
          data: JSON.stringify({
            type: "preview.status",
            projectId: "project-1",
            preview: { status: "running", port: 7555, url: "http://127.0.0.1:7555" }
          })
        })
      );
    });

    expect(screen.queryByRole("link", { name: "http://127.0.0.1:7555" })).not.toBeInTheDocument();
    expect(screen.getByText("stopped")).toBeInTheDocument();
  });

  it("does not show stale websocket errors from an old project after switching projects", async () => {
    render(<App />);

    await screen.findByRole("heading", { level: 2, name: "Demo Project" });
    const firstSocket = MockWebSocket.instances[0];
    fireEvent.click(await screen.findByRole("button", { name: /second project/i }));
    await screen.findByRole("heading", { level: 2, name: "Second Project" });

    await act(async () => {
      firstSocket?.onerror?.();
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Project event stream disconnected.")).not.toBeInTheDocument();
  });

  it("starts preview without sending an empty JSON content type", async () => {
    responseOverrides.set("/api/projects/project-1/preview/start", () =>
      jsonResponse({ status: "running", port: 6200, url: "http://127.0.0.1:6200" })
    );

    render(<App />);

    await screen.findByRole("heading", { level: 2, name: "Demo Project" });
    fireEvent.click(screen.getByRole("button", { name: /start preview/i }));

    expect(
      await screen.findByRole("link", { name: "http://127.0.0.1:6200" })
    ).toBeInTheDocument();
    const startCall = vi
      .mocked(fetch)
      .mock.calls.find(([input]) => String(input).endsWith("/api/projects/project-1/preview/start"));
    expect(startCall?.[1]).toEqual(expect.objectContaining({ method: "POST" }));
    expect((startCall?.[1]?.headers as Record<string, string> | undefined)?.["Content-Type"]).toBeUndefined();
  });

  it("stops a running preview through the preview API", async () => {
    responseOverrides.set("/api/projects", () =>
      jsonResponse([
        {
          id: "project-1",
          name: "Demo Project",
          slug: "demo-project",
          status: "ready",
          previewStatus: "running",
          previewPort: 4318,
          previewUrl: "http://preview.localhost:4318",
          createdAt: "2026-06-22T00:00:00.000Z",
          updatedAt: "2026-06-22T00:00:00.000Z"
        }
      ])
    );
    responseOverrides.set("/api/projects/project-1/preview/stop", () =>
      jsonResponse({ status: "stopped", port: null, url: null })
    );

    render(<App />);

    expect(
      await screen.findByRole("link", { name: "http://preview.localhost:4318" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /stop preview/i }));

    await waitFor(() => expect(screen.getByText("stopped")).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: "http://preview.localhost:4318" })).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/projects\/project-1\/preview\/stop$/),
      expect.objectContaining({ method: "POST" })
    );
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}
