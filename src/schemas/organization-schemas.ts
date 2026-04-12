import { z } from "zod";

import { PLAN_TYPES } from "../domain/core";
import { organization_schema } from "./common";

export const create_organization_request_schema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).optional(),
  plan_type: z.enum(PLAN_TYPES).default("trial"),
});

export const list_organizations_response_schema = z.object({
  organizations: z.array(organization_schema),
});
