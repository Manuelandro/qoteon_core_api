import { FastifyInstance } from "fastify";
import { z } from "zod";

import { AppServices } from "../build-services";
import { parse_schema } from "../lib/validation";

const project_params_schema = z.object({
  project_id: z.string().min(1),
});

export async function register_admin_reconciliation_routes(
  app: FastifyInstance,
  services: AppServices,
): Promise<void> {
  app.get("/admin/runs/baseline", async (request) => {
    return services.admin_run_service.list_baseline_launches(request.current_user);
  });

  app.get("/admin/projects/reconciliation", async (request) => {
    const query = parse_schema(
      z.object({
        search: z.string().optional(),
        status: z.string().optional(),
        organization_id: z.string().optional(),
        phase: z.string().optional(),
      }),
      request.query,
    );

    return services.reconciler_admin_service.list_projects(request.current_user, query);
  });

  app.get("/admin/projects/:project_id/reconciliation", async (request) => {
    const params = parse_schema(project_params_schema, request.params);
    return services.reconciler_admin_service.get_project(request.current_user, params.project_id);
  });

  app.post("/admin/projects/:project_id/reconciliation/run-now", async (request) => {
    const params = parse_schema(project_params_schema, request.params);
    return services.reconciler_admin_service.run_now(request.current_user, params.project_id);
  });

  app.post("/admin/projects/:project_id/recovery/retry-crawl", async (request) => {
    const params = parse_schema(project_params_schema, request.params);
    return services.reconciler_admin_service.retry_crawl(request.current_user, params.project_id);
  });

  app.post("/admin/projects/:project_id/recovery/regenerate-prompts", async (request) => {
    const params = parse_schema(project_params_schema, request.params);
    return services.reconciler_admin_service.regenerate_prompts(request.current_user, params.project_id);
  });

  app.post("/admin/projects/:project_id/recovery/launch-baseline", async (request) => {
    const params = parse_schema(project_params_schema, request.params);
    return services.reconciler_admin_service.launch_baseline(request.current_user, params.project_id);
  });

  app.post("/admin/projects/:project_id/recovery/restart-initial-pipeline", async (request) => {
    const params = parse_schema(project_params_schema, request.params);
    const body = parse_schema(
      z.object({
        force: z.boolean().default(false),
      }),
      request.body ?? {},
    );

    return services.reconciler_admin_service.restart_initial_pipeline(
      request.current_user,
      params.project_id,
      body.force,
    );
  });
}
