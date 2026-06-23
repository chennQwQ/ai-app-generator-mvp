import path from "node:path";
import { mkdirSync } from "node:fs";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import type { AppConfig } from "./config.js";
import { createAgentRunner } from "./agent/agent-runner.js";
import { AuditService } from "./audit/audit-service.js";
import { ConversationService } from "./conversations/conversation-service.js";
import { openDatabase } from "./db/database.js";
import { EventBus } from "./events/event-bus.js";
import { FileService } from "./files/file-service.js";
import { PreviewManager } from "./preview/preview-manager.js";
import { ProjectService } from "./projects/project-service.js";
import { TemplateService } from "./templates/template-service.js";
import { WorkflowService } from "./workflows/workflow-service.js";
import { WorkflowExecutor } from "./workflows/workflow-executor.js";
import { FakeApiFlowRuntimeAdapter } from "./apiflow/apiflow-adapter.js";
import { ApiFlowBridge } from "./apiflow/apiflow-bridge.js";
import { HttpApiFlowRuntimeAdapter } from "./apiflow/apiflow-http-adapter.js";
import { DeploymentService } from "./deployments/deployment-service.js";
import { registerAuditRoutes } from "./routes/audit.js";
import { registerDeployRoutes } from "./routes/deploy.js";
import { registerFileRoutes } from "./routes/files.js";
import { registerMessageRoutes } from "./routes/messages.js";
import { registerPreviewRoutes } from "./routes/preview.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerRunRoutes } from "./routes/runs.js";
import { registerTemplateRoutes } from "./routes/templates.js";
import { registerWebSocketRoutes } from "./routes/ws.js";
import { registerWorkflowRoutes } from "./routes/workflows.js";

export async function createServer(config: AppConfig) {
  const app = Fastify({ logger: true });
  const db = openDatabase(path.join(config.storageDir, "app.sqlite"));
  const bus = new EventBus();
  const templates = new TemplateService(config.templatesDir);
  const audit = new AuditService(db);
  const projects = new ProjectService(db, config, templates);
  const files = new FileService();
  const conversations = new ConversationService(db);
  const runner = createAgentRunner(config, bus, audit);
  projects.resetActivePreviews();
  const previewManager = new PreviewManager(config, bus, undefined, (projectId, preview) => {
    projects.updatePreview(projectId, preview);
  });
  const apiFlowAdapter = config.workflowRuntime === "apiflow"
    ? new FakeApiFlowRuntimeAdapter()
    : config.workflowRuntime === "apiflow-http"
      ? new HttpApiFlowRuntimeAdapter({ baseUrl: config.apiFlowSidecarUrl })
      : undefined;
  const apiFlowBridge = apiFlowAdapter ? new ApiFlowBridge(db, bus, apiFlowAdapter) : undefined;
  const deployments = new DeploymentService(db, config, bus, projects);

  await app.register(cors, { origin: config.webOrigin });
  await app.register(websocket);
  mkdirSync(path.join(config.storageDir, "deployments"), { recursive: true });
  await app.register(fastifyStatic, {
    root: path.join(config.storageDir, "deployments"),
    prefix: "/deploy/",
    decorateReply: false
  });

  app.addHook("onClose", async () => {
    previewManager.stopAll();
    audit.close();
    db.close();
  });
  app.get("/api/health", async () => {
    const agent = await runner.healthCheck();
    return { ok: true, agent };
  });
  await registerProjectRoutes(app, projects);
  await registerTemplateRoutes(app, templates);
  await registerWorkflowRoutes(
    app,
    new WorkflowService(db),
    new WorkflowExecutor(db, bus, runner, audit, projects),
    apiFlowAdapter,
    apiFlowBridge
  );
  await registerAuditRoutes(app, audit);
  await registerRunRoutes(app, projects, conversations, runner, bus);
  await registerFileRoutes(app, projects, files);
  await registerMessageRoutes(app, projects, conversations, runner, bus);
  await registerPreviewRoutes(app, projects, previewManager);
  await registerDeployRoutes(app, projects, deployments);
  await registerWebSocketRoutes(app, bus);

  return app;
}
