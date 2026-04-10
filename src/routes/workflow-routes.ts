import { FastifyInstance } from "fastify";
import { z } from "zod";

import { AppServices } from "../build-services";
import { run_type_schema } from "../schemas/common";
import { parse_schema } from "../lib/validation";
import {
  launch_run_request_schema,
  prompt_generation_request_schema,
  source_intelligence_crawl_request_schema,
} from "../schemas/workflow-schemas";
import {
  list_executions_query_schema,
  list_run_batches_query_schema,
} from "../schemas/run-schemas";

const project_params_schema = z.object({
  project_id: z.string().min(1),
});

const prompt_params_schema = z.object({
  project_id: z.string().min(1),
  prompt_id: z.string().min(1),
});

const prompt_set_params_schema = z.object({
  project_id: z.string().min(1),
  run_type: run_type_schema,
});

const run_batch_params_schema = z.object({
  run_batch_id: z.string().min(1),
});

const execution_retry_params_schema = z.object({
  run_batch_id: z.string().min(1),
  execution_id: z.string().min(1),
});

const list_project_prompts_query_schema = z
  .object({
    status: z.string().optional(),
    is_active: z.enum(["true", "false"]).optional(),
  })
  .transform((value) => ({
    status: value.status,
    is_active: value.is_active === undefined ? undefined : value.is_active === "true",
  }));

export async function register_workflow_routes(
  app: FastifyInstance,
  services: AppServices,
): Promise<void> {
  app.post("/projects/:project_id/prompts/generate", async (request) => {
    const params = parse_schema(project_params_schema, request.params);
    const body = parse_schema(prompt_generation_request_schema, request.body);

    return services.orchestration_service.regenerate_project_prompts(
      request.current_user.user_id,
      params.project_id,
      body,
    );
  });

  app.get("/projects/:project_id/prompts", async (request) => {
    const params = parse_schema(project_params_schema, request.params);
    const query = parse_schema(list_project_prompts_query_schema, request.query);

    return {
      prompts: await services.orchestration_service.list_project_prompts(
        request.current_user.user_id,
        params.project_id,
        query,
      ),
    };
  });

  app.get("/projects/:project_id/prompt-sets/:run_type", async (request) => {
    const params = parse_schema(prompt_set_params_schema, request.params);

    return services.orchestration_service.get_prompt_set_summary(
      request.current_user.user_id,
      params.project_id,
      params.run_type,
    );
  });

  app.post("/projects/:project_id/prompts/:prompt_id/activate", async (request) => {
    const params = parse_schema(prompt_params_schema, request.params);

    return services.orchestration_service.activate_prompt(
      request.current_user.user_id,
      params.project_id,
      params.prompt_id,
    );
  });

  app.post("/projects/:project_id/prompts/:prompt_id/deactivate", async (request) => {
    const params = parse_schema(prompt_params_schema, request.params);

    return services.orchestration_service.deactivate_prompt(
      request.current_user.user_id,
      params.project_id,
      params.prompt_id,
    );
  });

  app.post("/projects/:project_id/runs/baseline", async (request, reply) => {
    const params = parse_schema(project_params_schema, request.params);
    const body = parse_schema(launch_run_request_schema, request.body);
    const result = await services.orchestration_service.launch_baseline_scan(
      request.current_user.user_id,
      params.project_id,
      body.ai_model_ids,
      body.metadata_json,
    );

    return reply.code(201).send(result);
  });

  app.post("/projects/:project_id/runs/monthly-tracking", async (request, reply) => {
    const params = parse_schema(project_params_schema, request.params);
    const body = parse_schema(launch_run_request_schema, request.body);
    const result = await services.orchestration_service.launch_monthly_tracking(
      request.current_user.user_id,
      params.project_id,
      body.ai_model_ids,
      body.metadata_json,
    );

    return reply.code(201).send(result);
  });

  app.post("/projects/:project_id/source-intelligence/crawl-runs", async (request, reply) => {
    const params = parse_schema(project_params_schema, request.params);
    const body = parse_schema(source_intelligence_crawl_request_schema, request.body);
    const result = await services.orchestration_service.trigger_project_crawl(
      request.current_user.user_id,
      params.project_id,
      body,
    );

    return reply.code(201).send(result);
  });

  app.get("/projects/:project_id/source-intelligence/crawl-runs", async (request) => {
    const params = parse_schema(project_params_schema, request.params);
    const query = parse_schema(
      z.object({
        status: z.string().optional(),
        limit: z.coerce.number().int().positive().optional(),
      }),
      request.query,
    );

    return {
      crawl_runs: await services.orchestration_service.list_project_crawl_runs(
        request.current_user.user_id,
        params.project_id,
        query,
      ),
    };
  });

  app.get("/projects/:project_id/source-intelligence/prompt-context", async (request) => {
    const params = parse_schema(project_params_schema, request.params);
    return services.orchestration_service.get_project_prompt_context(
      request.current_user.user_id,
      params.project_id,
    );
  });

  app.get("/projects/:project_id/run-batches", async (request) => {
    const params = parse_schema(project_params_schema, request.params);
    const query = parse_schema(list_run_batches_query_schema, request.query);

    return {
      run_batches: await services.orchestration_service.list_project_run_batches(
        request.current_user.user_id,
        params.project_id,
        query,
      ),
    };
  });

  app.get("/run-batches/:run_batch_id", async (request) => {
    const params = parse_schema(run_batch_params_schema, request.params);
    return services.orchestration_service.get_run_batch(
      request.current_user.user_id,
      params.run_batch_id,
    );
  });

  app.get("/run-batches/:run_batch_id/progress", async (request) => {
    const params = parse_schema(run_batch_params_schema, request.params);
    return services.orchestration_service.get_run_progress(
      request.current_user.user_id,
      params.run_batch_id,
    );
  });

  app.get("/run-batches/:run_batch_id/executions", async (request) => {
    const params = parse_schema(run_batch_params_schema, request.params);
    const query = parse_schema(list_executions_query_schema, request.query);

    return {
      executions: await services.orchestration_service.list_executions(
        request.current_user.user_id,
        params.run_batch_id,
        query,
      ),
    };
  });

  app.post("/run-batches/:run_batch_id/executions/:execution_id/retry", async (request) => {
    const params = parse_schema(execution_retry_params_schema, request.params);

    return services.orchestration_service.retry_execution(
      request.current_user.user_id,
      params.run_batch_id,
      params.execution_id,
    );
  });
}
