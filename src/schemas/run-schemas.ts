import { z } from "zod";

import { json_record_schema, run_type_schema } from "./common";

export const run_batch_schema = z.object({
  id: z.string().min(1),
  project_id: z.string().min(1),
  run_type: run_type_schema,
  status: z.string(),
  prompt_ids: z.array(z.string().min(1)),
  ai_model_ids: z.array(z.string().min(1)),
  execution_count: z.number().int().nonnegative(),
  created_at: z.string(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  metadata_json: json_record_schema.nullable(),
});

export const run_progress_schema = z.object({
  run_batch_id: z.string().min(1),
  status: z.string(),
  total_executions: z.number().int().nonnegative(),
  queued_executions: z.number().int().nonnegative(),
  running_executions: z.number().int().nonnegative(),
  completed_executions: z.number().int().nonnegative(),
  failed_executions: z.number().int().nonnegative(),
  progress_percent: z.number(),
  updated_at: z.string().optional(),
});

export const execution_schema = z.object({
  id: z.string().min(1),
  run_batch_id: z.string().min(1),
  project_id: z.string().min(1).optional(),
  prompt_id: z.string().min(1),
  ai_model_id: z.string().min(1),
  status: z.string(),
  provider: z.string().nullable(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  error_message: z.string().nullable(),
});

export const list_run_batches_query_schema = z.object({
  status: z.string().optional(),
  run_type: run_type_schema.optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
});

export const list_executions_query_schema = z.object({
  status: z.string().optional(),
});

export const launch_run_response_schema = z.object({
  prompt_set: z.object({
    project_id: z.string().min(1),
    run_type: run_type_schema,
    prompt_ids: z.array(z.string().min(1)),
    prompt_count: z.number().int().nonnegative(),
    active_prompt_count: z.number().int().nonnegative(),
  }),
  run_batch: run_batch_schema,
});
