import type { FastifyInstance } from "fastify";
import type { AuditService } from "../audit/audit-service.js";

export async function registerAuditRoutes(app: FastifyInstance, audit: AuditService) {
  app.get("/api/projects/:projectId/audit", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    try {
      return audit.listByProject(projectId);
    } catch (error) {
      request.log.error({ err: error }, "Audit listing failed");
      return reply.code(500).send({ message: "Audit listing failed" });
    }
  });
}
