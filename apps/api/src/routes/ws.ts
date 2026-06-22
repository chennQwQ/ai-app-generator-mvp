import type { FastifyInstance } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import type { ProjectEvent } from "@ai-app-generator/shared";
import type { EventBus } from "../events/event-bus.js";

const POLICY_VIOLATION = 1008;
const SOCKET_OPEN = 1;

export async function registerWebSocketRoutes(app: FastifyInstance, bus: EventBus) {
  app.get("/ws", { websocket: true }, (socket, request) => {
    const projectId = getProjectId(request.url);
    if (!projectId) {
      socket.close(POLICY_VIOLATION, "projectId is required");
      return;
    }

    let unsubscribe: (() => void) | undefined = bus.subscribe(projectId, (event) => {
      safeSend(socket, event);
    });
    const cleanup = () => {
      unsubscribe?.();
      unsubscribe = undefined;
    };

    socket.once("close", cleanup);
    socket.once("error", cleanup);
  });
}

function getProjectId(requestUrl: string): string | null {
  const projectId = new URL(requestUrl, "http://localhost").searchParams.get("projectId")?.trim();
  return projectId ? projectId : null;
}

function safeSend(socket: WebSocket, event: ProjectEvent): void {
  if (socket.readyState !== SOCKET_OPEN) return;

  try {
    socket.send(JSON.stringify(event), () => {
      // Send errors are intentionally isolated from EventBus.publish.
    });
  } catch {
    // Closed or failing clients must not break other project event subscribers.
  }
}
