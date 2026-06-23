import type { FastifyInstance } from "fastify";
import { ProjectNotFoundError, type ProjectService } from "../projects/project-service.js";
import type { DeploymentService } from "../deployments/deployment-service.js";

export async function registerDeployRoutes(
  app: FastifyInstance,
  projects: ProjectService,
  deployments: DeploymentService
) {
  app.post("/api/projects/:projectId/deploy", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    try {
      const info = deployments.build(projectId);
      return reply.code(202).send(info);
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        return reply.code(404).send({ message: "Project not found" });
      }
      request.log.error({ err: error }, "Deployment start failed");
      return reply.code(500).send({ message: "Deployment start failed" });
    }
  });

  app.get("/api/projects/:projectId/deploy", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    try {
      projects.getWorkspacePath(projectId);
      const info = deployments.getLatest(projectId);
      if (!info) {
        return reply.code(404).send({ message: "No deployment found" });
      }
      return info;
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        return reply.code(404).send({ message: "Project not found" });
      }
      request.log.error({ err: error }, "Deployment status lookup failed");
      return reply.code(500).send({ message: "Deployment status lookup failed" });
    }
  });
}
