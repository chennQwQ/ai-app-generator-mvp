import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import type { AppConfig } from "./config.js";

export async function createServer(config: AppConfig) {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: config.webOrigin });
  await app.register(websocket);

  app.get("/api/health", async () => ({ ok: true }));

  return app;
}
