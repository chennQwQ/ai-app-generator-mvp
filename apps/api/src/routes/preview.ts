import type { FastifyInstance } from "fastify";
import { ProjectNotFoundError, type ProjectService } from "../projects/project-service.js";
import type { PreviewManager } from "../preview/preview-manager.js";

export async function registerPreviewRoutes(
  app: FastifyInstance,
  projects: ProjectService,
  previewManager: Pick<PreviewManager, "start" | "stop">
) {
  app.post("/api/projects/:projectId/preview/start", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    try {
      const workspacePath = projects.getWorkspacePath(projectId);
      return previewManager.start(projectId, workspacePath);
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        return reply.code(404).send({ message: "Project not found" });
      }

      request.log.error({ err: error }, "Preview start failed");
      return reply.code(500).send({ message: "Preview start failed" });
    }
  });

  app.post("/api/projects/:projectId/preview/stop", async (request) => {
    const { projectId } = request.params as { projectId: string };
    return previewManager.stop(projectId);
  });
}
