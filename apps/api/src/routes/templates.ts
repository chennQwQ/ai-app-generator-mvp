import type { FastifyInstance } from "fastify";
import type { TemplateService } from "../templates/template-service.js";

export async function registerTemplateRoutes(app: FastifyInstance, templates: TemplateService) {
  app.get("/api/templates", async (request, reply) => {
    try {
      return templates.list();
    } catch (error) {
      request.log.error({ err: error }, "Template listing failed");
      return reply.code(500).send({ message: "Template listing failed" });
    }
  });
}
