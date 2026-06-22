import type { FastifyInstance } from "fastify";
import { ProjectNotFoundError, type ProjectService } from "../projects/project-service.js";

export async function registerProjectRoutes(app: FastifyInstance, projects: ProjectService) {
  app.get("/api/projects", async (request, reply) => {
    try {
      return projects.listProjects();
    } catch (error) {
      request.log.error({ err: error }, "Project listing failed");
      return reply.code(500).send({ message: "Project listing failed" });
    }
  });

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
    const body = request.body;
    const name =
      body && typeof body === "object" && "name" in body && typeof body.name === "string"
        ? body.name.trim()
        : "";
    if (!name) return reply.code(400).send({ message: "Project name is required" });
    const template =
      body && typeof body === "object" && "template" in body && typeof body.template === "string"
        ? body.template.trim()
        : "react-vite";
    try {
      const project = projects.createProject(name, template);
      return reply.code(201).send(project);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Unknown template")) {
        return reply.code(400).send({ message: error.message });
      }
      request.log.error({ err: error }, "Project creation failed");
      return reply.code(500).send({ message: "Project creation failed" });
    }
  });

  app.delete("/api/projects/:projectId", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    try {
      projects.deleteProject(projectId);
      return { ok: true };
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        return reply.code(404).send({ message: "Project not found" });
      }
      request.log.error({ err: error }, "Project deletion failed");
      return reply.code(500).send({ message: "Project deletion failed" });
    }
  });
}
