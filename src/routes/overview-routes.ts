import { FastifyInstance } from "fastify";
import { z } from "zod";

import { AppServices } from "../build-services";
import { parse_schema } from "../lib/validation";
import {
  dashboard_base_query_schema,
  dashboard_clusters_query_schema,
  dashboard_competitors_query_schema,
  dashboard_models_query_schema,
  dashboard_projects_query_schema,
  dashboard_trends_query_schema,
} from "../schemas/dashboard-schemas";

const project_params_schema = z.object({
  project_id: z.string().min(1),
});

const run_batch_params_schema = z.object({
  run_batch_id: z.string().min(1),
});

export async function register_overview_routes(
  app: FastifyInstance,
  services: AppServices,
): Promise<void> {
  app.get("/projects/:project_id/overview", async (request) => {
    const params = parse_schema(project_params_schema, request.params);

    return services.dashboard_service.get_project_overview(
      request.current_user,
      params.project_id,
    );
  });

  app.get("/dashboard/projects", async (request) => {
    const query = parse_schema(dashboard_projects_query_schema, request.query);
    const projects = await services.dashboard_service.list_dashboard_projects(
      request.current_user,
      query,
    );

    return { projects };
  });

  app.get("/projects/:project_id/visibility/summary", async (request) => {
    const params = parse_schema(project_params_schema, request.params);
    const query = parse_schema(dashboard_base_query_schema, request.query);

    return services.dashboard_service.get_visibility_summary(
      request.current_user,
      params.project_id,
      query,
    );
  });

  app.get("/projects/:project_id/visibility/models", async (request) => {
    const params = parse_schema(project_params_schema, request.params);
    const query = parse_schema(dashboard_models_query_schema, request.query);

    return services.dashboard_service.get_model_breakdown(
      request.current_user,
      params.project_id,
      query,
    );
  });

  app.get("/projects/:project_id/visibility/clusters", async (request) => {
    const params = parse_schema(project_params_schema, request.params);
    const query = parse_schema(dashboard_clusters_query_schema, request.query);

    return services.dashboard_service.get_cluster_breakdown(
      request.current_user,
      params.project_id,
      query,
    );
  });

  app.get("/projects/:project_id/visibility/competitors", async (request) => {
    const params = parse_schema(project_params_schema, request.params);
    const query = parse_schema(dashboard_competitors_query_schema, request.query);

    return services.dashboard_service.get_competitor_breakdown(
      request.current_user,
      params.project_id,
      query,
    );
  });

  app.get("/projects/:project_id/visibility/trends", async (request) => {
    const params = parse_schema(project_params_schema, request.params);
    const query = parse_schema(dashboard_trends_query_schema, request.query);

    return services.dashboard_service.get_trends(
      request.current_user,
      params.project_id,
      query,
    );
  });

  app.get("/run-batches/:run_batch_id/results", async (request) => {
    const params = parse_schema(run_batch_params_schema, request.params);

    return services.dashboard_service.get_run_results(
      request.current_user,
      params.run_batch_id,
    );
  });
}
