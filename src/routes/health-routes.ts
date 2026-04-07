import { FastifyInstance } from "fastify";

export async function register_health_routes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({
    status: "ok",
    service: "qoteon-core-api",
  }));
}
