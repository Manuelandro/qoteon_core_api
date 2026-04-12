import { z } from "zod";

import {
  ORGANIZATION_BILLING_STATUSES,
  ORGANIZATION_ROLES,
  PLAN_TYPES,
  PROJECT_STATUSES,
  RUN_TYPES,
  USER_ROLES,
} from "../domain/core";

export const id_schema = z.string().min(1);
export const json_record_schema = z.record(z.string(), z.unknown());
export const region_array_schema = z.array(z.string().min(1)).min(1);

export const organization_schema = z.object({
  id: id_schema,
  name: z.string(),
  slug: z.string(),
  plan_type: z.enum(PLAN_TYPES),
  billing_status: z.enum(ORGANIZATION_BILLING_STATUSES),
  project_limit: z.number().int().nonnegative(),
  competitor_limit: z.number().int().nonnegative(),
  tracked_model_limit: z.number().int().nonnegative(),
  tracked_prompts_daily_limit: z.number().int().nonnegative(),
  llm_response_limit: z.number().int().nonnegative(),
  article_draft_limit: z.number().int().nonnegative(),
  page_improvement_limit: z.number().int().nonnegative(),
  crawled_page_limit: z.number().int().nonnegative(),
  data_retention_months: z.number().int().positive().nullable(),
  trial_started_at: z.string().nullable(),
  trial_expires_at: z.string().nullable(),
  billing_period_started_at: z.string().nullable(),
  billing_period_ends_at: z.string().nullable(),
  stripe_customer_id: z.string().nullable(),
  stripe_subscription_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const user_schema = z.object({
  id: id_schema,
  email: z.string().email(),
  full_name: z.string().nullable(),
  role: z.enum(USER_ROLES),
  created_at: z.string(),
  updated_at: z.string(),
});

export const organization_user_schema = z.object({
  id: id_schema,
  organization_id: id_schema,
  user_id: id_schema,
  org_role: z.enum(ORGANIZATION_ROLES),
  created_at: z.string(),
});

export const project_schema = z.object({
  id: id_schema,
  organization_id: id_schema,
  name: z.string(),
  domain: z.string(),
  company_name: z.string(),
  primary_category: z.string(),
  target_region: region_array_schema,
  target_language: z.string(),
  status: z.enum(PROJECT_STATUSES),
  created_at: z.string(),
  updated_at: z.string(),
});

export const competitor_schema = z.object({
  id: id_schema,
  project_id: id_schema,
  competitor_name: z.string(),
  competitor_domain: z.string(),
  notes: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const service_warning_schema = z.object({
  code: z.string(),
  message: z.string(),
  service: z.enum(["core_api", "prompt_library", "prompt_runner", "source_intelligence", "dashboard_layer"]),
  retryable: z.boolean(),
  details: json_record_schema.optional(),
});

export const run_type_schema = z.enum(RUN_TYPES);
