import type { FastifyInstance } from "fastify";
import { ProjectNotFoundError, type ProjectService } from "../projects/project-service.js";

export async function registerProjectRoutes(app: FastifyInstance, projects: ProjectService) {
  app.get("/api/projects", async () => projects.listProjects());

  app.get("/api/projects/:projectId", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    try {
      return projects.getProject(projectId);
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        return reply.code(404).send({ message: "Project not found" });
      }

      request.log.error({ err: error }, "Project lookup failed");
      return reply.code(500).send({ message: "Project lookup failed" });
    }
  });

  app.post("/api/projects", async (request, reply) => {
    const body = request.body as { name?: string };
    const name = body.name?.trim();
    if (!name) return reply.code(400).send({ message: "Project name is required" });
    try {
      const project = projects.createProject(name);
      return reply.code(201).send(project);
    } catch (error) {
      request.log.error({ err: error }, "Project creation failed");
      return reply.code(500).send({ message: "Project creation failed" });
    }
  });
}
