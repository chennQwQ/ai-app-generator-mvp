import type { FastifyInstance } from "fastify";
import {
  DirectoryReadError,
  FileNotFoundError,
  FileService,
  FileTooLargeError,
  InvalidFilePathError
} from "../files/file-service.js";
import { ProjectNotFoundError, type ProjectService } from "../projects/project-service.js";

export async function registerFileRoutes(
  app: FastifyInstance,
  projects: ProjectService,
  files: FileService
) {
  app.get("/api/projects/:projectId/files", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    try {
      const workspacePath = projects.getWorkspacePath(projectId);
      return await files.getTree(workspacePath);
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        return reply.code(404).send({ message: "Project not found" });
      }

      request.log.error({ err: error }, "File listing failed");
      return reply.code(500).send({ message: "File listing failed" });
    }
  });

  app.get("/api/projects/:projectId/files/content", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const relativePath = parseFilePath(request.query);
    if (!relativePath) return reply.code(400).send({ message: "File path is required" });

    try {
      const workspacePath = projects.getWorkspacePath(projectId);
      const content = await files.readFile(workspacePath, relativePath);
      return { content };
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        return reply.code(404).send({ message: "Project not found" });
      }
      if (error instanceof InvalidFilePathError) {
        return reply.code(400).send({ message: error.message });
      }
      if (error instanceof FileNotFoundError) {
        return reply.code(404).send({ message: error.message });
      }
      if (error instanceof DirectoryReadError) {
        return reply.code(400).send({ message: error.message });
      }
      if (error instanceof FileTooLargeError) {
        return reply.code(413).send({ message: error.message });
      }

      request.log.error({ err: error }, "File read failed");
      return reply.code(500).send({ message: "File read failed" });
    }
  });
}

function parseFilePath(query: unknown): string | null {
  if (!query || typeof query !== "object" || !("path" in query)) return null;
  const filePath = query.path;
  if (typeof filePath !== "string") return null;
  return filePath ? filePath : null;
}
