import path from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import type { AppConfig } from "./config.js";
import { createAgentRunner } from "./agent/agent-runner.js";
import { ConversationService } from "./conversations/conversation-service.js";
import { openDatabase } from "./db/database.js";
import { EventBus } from "./events/event-bus.js";
import { FileService } from "./files/file-service.js";
import { ProjectService } from "./projects/project-service.js";
import { registerFileRoutes } from "./routes/files.js";
import { registerMessageRoutes } from "./routes/messages.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerWebSocketRoutes } from "./routes/ws.js";

export async function createServer(config: AppConfig) {
  const app = Fastify({ logger: true });
  const db = openDatabase(path.join(config.storageDir, "app.sqlite"));
  const bus = new EventBus();
  const projects = new ProjectService(db, config);
  const files = new FileService();
  const conversations = new ConversationService(db);
  const runner = createAgentRunner(config, bus);

  await app.register(cors, { origin: config.webOrigin });
  await app.register(websocket);

  app.addHook("onClose", async () => db.close());
  app.get("/api/health", async () => ({ ok: true }));
  await registerProjectRoutes(app, projects);
  await registerFileRoutes(app, projects, files);
  await registerMessageRoutes(app, projects, conversations, runner, bus);
  await registerWebSocketRoutes(app, bus);

  return app;
}
