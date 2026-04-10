import { z } from "zod";

import { PROJECT_STATUSES } from "../domain/core";
import { competitor_schema, json_record_schema, project_schema } from "./common";

export const competitor_create_request_schema = z.object({
  competitor_name: z.string().min(1),
  competitor_domain: z.string().min(1),
  notes: z.string().nullable().optional(),
});

export const competitor_update_request_schema = z
  .object({
    competitor_name: z.string().min(1).optional(),
    competitor_domain: z.string().min(1).optional(),
    notes: z.string().nullable().optional(),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: "At least one competitor field must be provided",
  });

export const project_create_request_schema = z.object({
  organization_id: z.string().min(1),
  name: z.string().min(1),
  domain: z.string().min(1),
  company_name: z.string().min(1),
  primary_category: z.string().min(1),
  target_region: z.string().min(1),
  target_language: z.string().min(1),
  status: z.enum(PROJECT_STATUSES).optional(),
  competitors: z.array(competitor_create_request_schema).optional(),
  generate_initial_prompts: z.boolean().default(false),
  prompt_generation_payload: z
    .object({
      category: z.string().min(1).optional(),
      competitors: z.array(z.string().min(1)).optional(),
      personas: z.array(z.string().min(1)).optional(),
      use_cases: z.array(z.string().min(1)).optional(),
      region: z.string().min(1).optional(),
      language: z.string().min(1).optional(),
      metadata_json: json_record_schema.optional(),
    })
    .optional(),
});

export const project_update_request_schema = z
  .object({
    name: z.string().min(1).optional(),
    domain: z.string().min(1).optional(),
    company_name: z.string().min(1).optional(),
    primary_category: z.string().min(1).optional(),
    target_region: z.string().min(1).optional(),
    target_language: z.string().min(1).optional(),
    status: z.enum(PROJECT_STATUSES).optional(),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: "At least one project field must be provided",
  });

export const list_projects_query_schema = z.object({
  organization_id: z.string().min(1).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
});

export const list_competitors_response_schema = z.object({
  competitors: z.array(competitor_schema),
});

export const list_projects_response_schema = z.object({
  projects: z.array(project_schema),
});
