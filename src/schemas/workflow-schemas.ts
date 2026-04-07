import { z } from "zod";

import { competitor_schema, json_record_schema, project_schema, run_type_schema, service_warning_schema } from "./common";

export const prompt_generation_request_schema = z.object({
  prompt_count: z.number().int().positive().optional(),
  intents: z.array(z.string().min(1)).optional(),
  seed_topics: z.array(z.string().min(1)).optional(),
  metadata_json: json_record_schema.optional(),
});

export const prompt_record_schema = z.object({
  id: z.string().min(1),
  project_id: z.string().min(1),
  title: z.string(),
  body: z.string().nullable().optional(),
  cluster: z.string().nullable().optional(),
  intent: z.string().nullable().optional(),
  status: z.string(),
  is_active: z.boolean(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const prompt_set_summary_schema = z.object({
  project_id: z.string().min(1),
  run_type: run_type_schema,
  prompt_count: z.number().int().nonnegative(),
  active_prompt_count: z.number().int().nonnegative(),
});

export const setup_project_response_schema = z.object({
  status: z.enum(["success", "partial_success"]),
  project: project_schema,
  competitors: z.array(competitor_schema),
  prompt_generation: z.object({
    attempted: z.boolean(),
    succeeded: z.boolean(),
    result: z
      .object({
        project_id: z.string().min(1),
        generated_count: z.number().int().nonnegative(),
        total_prompts: z.number().int().nonnegative(),
        active_prompts: z.number().int().nonnegative(),
        prompt_ids: z.array(z.string().min(1)),
      })
      .nullable(),
  }),
  warnings: z.array(service_warning_schema),
});

export const launch_run_request_schema = z.object({
  ai_model_ids: z.array(z.string().min(1)).min(1),
  metadata_json: json_record_schema.optional(),
});
