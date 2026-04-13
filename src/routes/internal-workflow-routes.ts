import { FastifyInstance } from "fastify";
import { z } from "zod";

import { AppServices } from "../build-services";
import { parse_schema } from "../lib/validation";

const project_params_schema = z.object({
  project_id: z.string().min(1),
});

const launch_baseline_body_schema = z.object({
  ai_model_ids: z.array(z.string().min(1)).min(1),
  metadata_json: z.record(z.unknown()).default({}),
  idempotency_key: z.string().min(1),
});

const automation_body_schema = z.object({
  metadata_json: z.record(z.unknown()).default({}),
  idempotency_key: z.string().min(1),
});

const INTERNAL_ACTOR = {
  user_id: "internal-automation",
  role: "admin" as const,
};

export async function register_internal_workflow_routes(
  app: FastifyInstance,
  services: AppServices,
): Promise<void> {
  app.post("/projects/:project_id/runs/initial-baseline", async (request, reply) => {
    const params = parse_schema(project_params_schema, request.params);
    const result = await services.workflow_request_service.launch_initial_baseline_automatically(
      params.project_id,
    );

    if (result.replayed) {
      reply.header("x-idempotent-replay", "true");
    }

    return reply.code(result.response_status_code).send(result.response_body);
  });

  app.post("/projects/:project_id/runs/baseline", async (request, reply) => {
    const params = parse_schema(project_params_schema, request.params);
    const body = parse_schema(launch_baseline_body_schema, request.body);
    const result = await services.workflow_request_service.launch_baseline_scan({
      user: INTERNAL_ACTOR,
      project_id: params.project_id,
      ai_model_ids: body.ai_model_ids,
      metadata_json: body.metadata_json,
      idempotency_key: body.idempotency_key,
    });

    if (result.replayed) {
      reply.header("x-idempotent-replay", "true");
    }

    return reply.code(result.response_status_code).send(result.response_body);
  });

  app.post("/projects/:project_id/runs/daily-tracking", async (request, reply) => {
    const params = parse_schema(project_params_schema, request.params);
    const body = parse_schema(launch_baseline_body_schema, request.body);
    const result = await services.workflow_request_service.launch_daily_tracking({
      user: INTERNAL_ACTOR,
      project_id: params.project_id,
      ai_model_ids: body.ai_model_ids,
      metadata_json: body.metadata_json,
      idempotency_key: body.idempotency_key,
    });

    if (result.replayed) {
      reply.header("x-idempotent-replay", "true");
    }

    return reply.code(result.response_status_code).send(result.response_body);
  });

  app.post("/projects/:project_id/daily-runner/crawl-refresh", async (request, reply) => {
    const params = parse_schema(project_params_schema, request.params);
    const body = parse_schema(automation_body_schema, request.body);
    const result = await services.workflow_request_service.trigger_refresh_crawl_automatically({
      project_id: params.project_id,
      idempotency_key: body.idempotency_key,
    });

    if (result.replayed) {
      reply.header("x-idempotent-replay", "true");
    }

    return reply.code(result.response_status_code).send(result.response_body);
  });

  app.get("/projects/:project_id/daily-runner/prompt-context", async (request) => {
    const params = parse_schema(project_params_schema, request.params);
    return services.orchestration_service.get_project_prompt_context(INTERNAL_ACTOR, params.project_id);
  });

  app.post("/projects/:project_id/daily-runner/prompts/regenerate", async (request, reply) => {
    const params = parse_schema(project_params_schema, request.params);
    const body = parse_schema(
      z.object({
        metadata_json: z.record(z.unknown()).default({}),
      }),
      request.body ?? {},
    );

    const result = await services.orchestration_service.regenerate_project_prompts(
      INTERNAL_ACTOR,
      params.project_id,
      {
        metadata_json: body.metadata_json,
      },
    );

    return reply.code(201).send(result);
  });

  app.post("/projects/:project_id/daily-runner/runs/daily-tracking", async (request, reply) => {
    const params = parse_schema(project_params_schema, request.params);
    const body = parse_schema(automation_body_schema, request.body);
    const result = await services.workflow_request_service.launch_daily_tracking_automatically(
      params.project_id,
      body.metadata_json,
      body.idempotency_key,
    );

    if (result.replayed) {
      reply.header("x-idempotent-replay", "true");
    }

    return reply.code(result.response_status_code).send(result.response_body);
  });

  app.get("/daily-runner/run-batches/:run_batch_id/progress", async (request) => {
    const params = parse_schema(
      z.object({
        run_batch_id: z.string().min(1),
      }),
      request.params,
    );

    return services.orchestration_service.get_run_progress(INTERNAL_ACTOR, params.run_batch_id);
  });
}
