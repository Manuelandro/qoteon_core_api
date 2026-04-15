import { z } from "zod";

import {
  competitor_schema,
  json_record_schema,
  project_schema,
  run_type_schema,
  service_warning_schema,
} from "./common";

export const prompt_generation_request_schema = z.object({
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
  metadata_json: json_record_schema.nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  archived_at: z.string().nullable().optional(),
});

export const update_prompt_request_schema = z.object({
  prompt_text: z.string().trim().min(1).max(2000),
});

export const prompt_library_item_schema = z.object({
  id: z.string().min(1),
  prompt_text: z.string(),
  cluster_name: z.string(),
  intent_type: z.string(),
  language: z.string(),
  region: z.array(z.string()).nullable(),
  source_type: z.string(),
  is_active: z.boolean(),
  metadata_json: json_record_schema.nullable(),
  imported_project_prompt_id: z.string().nullable(),
  is_imported: z.boolean(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const prompt_library_query_schema = z.object({
  search: z.string().trim().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export const prompt_capacity_summary_schema = z.object({
  project_id: z.string().min(1),
  organization_id: z.string().min(1),
  tracked_prompt_limit: z.number().int().nonnegative(),
  tracked_prompts_in_use: z.number().int().nonnegative(),
  tracked_prompts_remaining: z.number().int().nonnegative(),
  active_project_prompt_count: z.number().int().nonnegative(),
  daily_tracked_prompts_used: z.number().int().nonnegative(),
  daily_tracked_prompts_remaining: z.number().int().nonnegative(),
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

export const source_intelligence_crawl_request_schema = z.object({
  target_scope: z.enum(["client", "competitors", "all"]).optional(),
  competitor_ids: z.array(z.string().min(1)).optional(),
  scope_type: z.enum(["full", "incremental", "single_url"]).optional(),
  max_pages: z.number().int().positive().optional(),
  max_depth: z.number().int().positive().optional(),
  single_url: z.string().min(1).optional(),
});
