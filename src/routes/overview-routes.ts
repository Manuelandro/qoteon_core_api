import { FastifyInstance } from "fastify";
import { z } from "zod";

import { AppServices } from "../build-services";
import { parse_schema } from "../lib/validation";
import { list_projects_query_schema } from "../schemas/project-schemas";

const project_params_schema = z.object({
  project_id: z.string().min(1),
});

export async function register_overview_routes(
  app: FastifyInstance,
  services: AppServices,
): Promise<void> {
  app.get("/projects/:project_id/overview", async (request) => {
    const params = parse_schema(project_params_schema, request.params);

    return services.dashboard_service.get_project_overview(
      request.current_user.user_id,
      params.project_id,
    );
  });

  app.get("/dashboard/projects", async (request) => {
    const query = parse_schema(list_projects_query_schema, request.query);
    const projects = await services.dashboard_service.list_dashboard_projects(
      request.current_user.user_id,
      query,
    );

    return { projects };
  });
}
