import { z } from "zod";

import { competitor_schema, project_schema, service_warning_schema, run_type_schema } from "./common";

export const prompt_summary_schema = z.object({
  total_prompts: z.number().int().nonnegative(),
  active_prompts: z.number().int().nonnegative(),
  by_cluster: z.record(z.string(), z.number().int().nonnegative()),
  by_intent: z.record(z.string(), z.number().int().nonnegative()),
});

export const run_summary_schema = z.object({
  run_batch_id: z.string().min(1),
  run_type: run_type_schema,
  status: z.string(),
  prompt_count: z.number().int().nonnegative(),
  execution_count: z.number().int().nonnegative(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  progress: z
    .object({
      run_batch_id: z.string().min(1),
      status: z.string(),
      total_executions: z.number().int().nonnegative(),
      queued_executions: z.number().int().nonnegative(),
      running_executions: z.number().int().nonnegative(),
      completed_executions: z.number().int().nonnegative(),
      failed_executions: z.number().int().nonnegative(),
      progress_percent: z.number(),
      updated_at: z.string().optional(),
    })
    .nullable(),
});

export const project_overview_response_schema = z.object({
  project: project_schema,
  competitors: z.array(competitor_schema),
  prompt_summary: prompt_summary_schema.nullable(),
  latest_runs: z.array(run_summary_schema),
  health_flags: z.array(z.string()),
  warnings: z.array(service_warning_schema),
});

export const dashboard_project_summary_schema = z.object({
  project: project_schema,
  prompt_summary: prompt_summary_schema.nullable(),
  latest_run: run_summary_schema.nullable(),
  warnings: z.array(service_warning_schema),
});

export const dashboard_summary_response_schema = z.object({
  projects: z.array(dashboard_project_summary_schema),
});
