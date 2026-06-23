import type { FastifyInstance } from "fastify";
import { ProjectNotFoundError, type ProjectService } from "../projects/project-service.js";

export async function registerProjectRoutes(app: FastifyInstance, projects: ProjectService) {
  app.get("/api/projects", async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const search = query.search ?? undefined;
    const sort = query.sort === "name" ? "name" : "created";
    const order = query.order === "asc" ? "asc" : "desc";
    const limit = query.limit ? Math.min(parseInt(query.limit, 10) || 50, 100) : 50;
    const offset = query.offset ? Math.max(parseInt(query.offset, 10) || 0, 0) : 0;

    try {
      if (search || sort !== "created" || order !== "desc" || limit !== 50 || offset !== 0) {
        return projects.listProjectsFiltered({ search, sort, order, limit, offset });
      }
      const all = projects.listProjects();
      return { projects: all, total: all.length };
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
