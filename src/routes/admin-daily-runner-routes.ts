import { FastifyInstance } from "fastify";
import { z } from "zod";

import { AppServices } from "../build-services";
import { parse_schema } from "../lib/validation";

const project_params_schema = z.object({
  project_id: z.string().min(1),
});

const workflow_params_schema = z.object({
  workflow_run_id: z.string().min(1),
});

export async function register_admin_daily_runner_routes(
  app: FastifyInstance,
  services: AppServices,
): Promise<void> {
  app.get("/admin/runs/daily", async (request) => {
    return services.admin_run_service.list_daily_launches(request.current_user);
  });

  app.get("/admin/daily-runner/projects", async (request) => {
    const query = parse_schema(
      z.object({
        search: z.string().optional(),
        organization_id: z.string().optional(),
        is_enabled: z.coerce.boolean().optional(),
      }),
      request.query,
    );

    return services.daily_runner_admin_service.list_projects(request.current_user, query);
  });

  app.get("/admin/daily-runner/projects/:project_id", async (request) => {
    const params = parse_schema(project_params_schema, request.params);
    return services.daily_runner_admin_service.get_project(request.current_user, params.project_id);
  });

  app.get("/admin/daily-runner/projects/:project_id/workflow-runs", async (request) => {
    const params = parse_schema(project_params_schema, request.params);
    return services.daily_runner_admin_service.list_project_workflow_runs(
      request.current_user,
      params.project_id,
    );
  });

  app.get("/admin/daily-runner/projects/:project_id/workflows/latest", async (request) => {
    const params = parse_schema(project_params_schema, request.params);
    return services.daily_runner_admin_service.get_latest_project_workflow(
      request.current_user,
      params.project_id,
    );
  });

  app.get("/admin/daily-runner/workflows/:workflow_run_id", async (request) => {
    const params = parse_schema(workflow_params_schema, request.params);
    return services.daily_runner_admin_service.get_workflow(
      request.current_user,
      params.workflow_run_id,
    );
  });

  app.get("/admin/daily-runner/workflows/:workflow_run_id/events", async (request) => {
    const params = parse_schema(workflow_params_schema, request.params);
    return services.daily_runner_admin_service.list_workflow_events(
      request.current_user,
      params.workflow_run_id,
    );
  });

  app.post("/admin/daily-runner/projects/:project_id/run-now", async (request) => {
    const params = parse_schema(project_params_schema, request.params);
    return services.daily_runner_admin_service.run_now(request.current_user, params.project_id);
  });

  app.post("/admin/projects/:project_id/recovery/launch-daily", async (request) => {
    const params = parse_schema(project_params_schema, request.params);
    return services.admin_run_service.launch_daily(request.current_user, params.project_id);
  });

  app.post("/admin/daily-runner/projects/:project_id/pause", async (request) => {
    const params = parse_schema(project_params_schema, request.params);
    const body = parse_schema(
      z.object({
        reason: z.string().optional(),
      }),
      request.body ?? {},
    );

    return services.daily_runner_admin_service.pause(request.current_user, params.project_id, body.reason);
  });

  app.post("/admin/daily-runner/projects/:project_id/resume", async (request) => {
    const params = parse_schema(project_params_schema, request.params);
    return services.daily_runner_admin_service.resume(request.current_user, params.project_id);
  });

  app.post("/admin/daily-runner/projects/:project_id/update-schedule", async (request) => {
    const params = parse_schema(project_params_schema, request.params);
    const body = parse_schema(
      z.object({
        timezone: z.string().optional(),
        run_at_local_time: z.string().optional(),
        is_enabled: z.boolean().optional(),
        refresh_crawl_enabled: z.boolean().optional(),
        regenerate_prompts_enabled: z.boolean().optional(),
        launch_daily_tracking_enabled: z.boolean().optional(),
        paused_reason: z.string().nullable().optional(),
      }),
      request.body ?? {},
    );

    return services.daily_runner_admin_service.update_schedule(
      request.current_user,
      params.project_id,
      body,
    );
  });

  app.post("/admin/daily-runner/projects/:project_id/restart-workflow", async (request) => {
    const params = parse_schema(project_params_schema, request.params);
    return services.daily_runner_admin_service.restart_workflow(
      request.current_user,
      params.project_id,
    );
  });

  app.post("/admin/daily-runner/workflows/:workflow_run_id/retry-step", async (request) => {
    const params = parse_schema(workflow_params_schema, request.params);
    const body = parse_schema(
      z.object({
        source: z.string().optional(),
      }),
      request.body ?? {},
    );

    return services.daily_runner_admin_service.retry_workflow_step(
      request.current_user,
      params.workflow_run_id,
      body.source,
    );
  });

  app.post("/admin/daily-runner/workflows/:workflow_run_id/restart", async (request) => {
    const params = parse_schema(workflow_params_schema, request.params);
    const body = parse_schema(
      z.object({
        source: z.string().optional(),
      }),
      request.body ?? {},
    );

    return services.daily_runner_admin_service.restart_workflow_run(
      request.current_user,
      params.workflow_run_id,
      body.source,
    );
  });
}
