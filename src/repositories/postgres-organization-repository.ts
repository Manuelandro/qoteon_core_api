import { type Pool } from "pg";

import { Organization, OrganizationUser } from "../domain/core";
import { throw_postgres_error, to_iso_string } from "../db/postgres";
import {
  AddOrganizationUserInput,
  OrganizationRepository,
} from "./organization-repository";

interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  plan_type: Organization["plan_type"];
  billing_status: Organization["billing_status"];
  project_limit: number;
  competitor_limit: number;
  tracked_model_limit: number;
  tracked_prompts_daily_limit: number;
  llm_response_limit: number;
  article_draft_limit: number;
  page_improvement_limit: number;
  crawled_page_limit: number;
  data_retention_months: number | null;
  trial_started_at: Date | string | null;
  trial_expires_at: Date | string | null;
  billing_period_started_at: Date | string | null;
  billing_period_ends_at: Date | string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface OrganizationUserRow {
  id: string;
  organization_id: string;
  user_id: string;
  org_role: OrganizationUser["org_role"];
  created_at: Date | string;
}

export class PostgresOrganizationRepository implements OrganizationRepository {
  constructor(private readonly pool: Pool) {}

  async create_organization(input: {
    name: string;
    slug: string;
    plan_type: Organization["plan_type"];
    billing_status: Organization["billing_status"];
    project_limit: number;
    competitor_limit: number;
    tracked_model_limit: number;
    tracked_prompts_daily_limit: number;
    llm_response_limit: number;
    article_draft_limit: number;
    page_improvement_limit: number;
    crawled_page_limit: number;
    data_retention_months: number | null;
    trial_started_at?: string | null;
    trial_expires_at?: string | null;
    billing_period_started_at?: string | null;
    billing_period_ends_at?: string | null;
    stripe_customer_id?: string | null;
    stripe_subscription_id?: string | null;
  }): Promise<Organization> {
    try {
      const result = await this.pool.query<OrganizationRow>(
        `
          INSERT INTO public.core_organizations (
            name,
            slug,
            plan_type,
            billing_status,
            project_limit,
            competitor_limit,
            tracked_model_limit,
            tracked_prompts_daily_limit,
            llm_response_limit,
            article_draft_limit,
            page_improvement_limit,
            crawled_page_limit,
            data_retention_months,
            trial_started_at,
            trial_expires_at,
            billing_period_started_at,
            billing_period_ends_at,
            stripe_customer_id,
            stripe_subscription_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
          RETURNING *
        `,
        [
          input.name,
          input.slug,
          input.plan_type,
          input.billing_status,
          input.project_limit,
          input.competitor_limit,
          input.tracked_model_limit,
          input.tracked_prompts_daily_limit,
          input.llm_response_limit,
          input.article_draft_limit,
          input.page_improvement_limit,
          input.crawled_page_limit,
          input.data_retention_months,
          input.trial_started_at ?? null,
          input.trial_expires_at ?? null,
          input.billing_period_started_at ?? null,
          input.billing_period_ends_at ?? null,
          input.stripe_customer_id ?? null,
          input.stripe_subscription_id ?? null,
        ],
      );

      const row = result.rows[0];

      if (!row) {
        throw new Error("Failed to create organization");
      }

      return map_organization(row);
    } catch (error) {
      throw_postgres_error(as_postgres_error(error), "Unable to create organization");
    }
  }

  async get_organization_by_id(organization_id: string): Promise<Organization | null> {
    try {
      const result = await this.pool.query<OrganizationRow>(
        `SELECT * FROM public.core_organizations WHERE id = $1 LIMIT 1`,
        [organization_id],
      );

      const row = result.rows[0];
      return row ? map_organization(row) : null;
    } catch (error) {
      throw_postgres_error(as_postgres_error(error), "Unable to load organization");
    }
  }

  async list_all_organizations(): Promise<Organization[]> {
    try {
      const result = await this.pool.query<OrganizationRow>(
        `
          SELECT *
          FROM public.core_organizations
          ORDER BY created_at DESC
        `,
      );

      return result.rows.map(map_organization);
    } catch (error) {
      throw_postgres_error(as_postgres_error(error), "Unable to list organizations");
    }
  }

  async list_organizations_for_user(user_id: string): Promise<Organization[]> {
    try {
      const result = await this.pool.query<OrganizationRow>(
        `
          SELECT o.*
          FROM public.core_organizations o
          INNER JOIN public.core_organization_users ou
            ON ou.organization_id = o.id
          WHERE ou.user_id = $1
          ORDER BY o.created_at DESC
        `,
        [user_id],
      );

      return result.rows.map(map_organization);
    } catch (error) {
      throw_postgres_error(as_postgres_error(error), "Unable to list organizations");
    }
  }

  async add_user_to_organization(input: AddOrganizationUserInput): Promise<OrganizationUser> {
    try {
      const result = await this.pool.query<OrganizationUserRow>(
        `
          INSERT INTO public.core_organization_users (
            organization_id,
            user_id,
            org_role
          )
          VALUES ($1, $2, $3)
          RETURNING *
        `,
        [input.organization_id, input.user_id, input.org_role],
      );

      const row = result.rows[0];

      if (!row) {
        throw new Error("Failed to create organization membership");
      }

      return map_membership(row);
    } catch (error) {
      throw_postgres_error(as_postgres_error(error), "Unable to add organization membership");
    }
  }

  async get_membership(
    organization_id: string,
    user_id: string,
  ): Promise<OrganizationUser | null> {
    try {
      const result = await this.pool.query<OrganizationUserRow>(
        `
          SELECT *
          FROM public.core_organization_users
          WHERE organization_id = $1 AND user_id = $2
          LIMIT 1
        `,
        [organization_id, user_id],
      );

      const row = result.rows[0];
      return row ? map_membership(row) : null;
    } catch (error) {
      throw_postgres_error(as_postgres_error(error), "Unable to load organization membership");
    }
  }
}

function map_organization(row: OrganizationRow): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan_type: row.plan_type,
    billing_status: row.billing_status,
    project_limit: row.project_limit,
    competitor_limit: row.competitor_limit,
    tracked_model_limit: row.tracked_model_limit,
    tracked_prompts_daily_limit: row.tracked_prompts_daily_limit,
    llm_response_limit: row.llm_response_limit,
    article_draft_limit: row.article_draft_limit,
    page_improvement_limit: row.page_improvement_limit,
    crawled_page_limit: row.crawled_page_limit,
    data_retention_months: row.data_retention_months,
    trial_started_at: row.trial_started_at ? to_iso_string(row.trial_started_at) : null,
    trial_expires_at: row.trial_expires_at ? to_iso_string(row.trial_expires_at) : null,
    billing_period_started_at: row.billing_period_started_at
      ? to_iso_string(row.billing_period_started_at)
      : null,
    billing_period_ends_at: row.billing_period_ends_at ? to_iso_string(row.billing_period_ends_at) : null,
    stripe_customer_id: row.stripe_customer_id,
    stripe_subscription_id: row.stripe_subscription_id,
    created_at: to_iso_string(row.created_at),
    updated_at: to_iso_string(row.updated_at),
  };
}

function map_membership(row: OrganizationUserRow): OrganizationUser {
  return {
    id: row.id,
    organization_id: row.organization_id,
    user_id: row.user_id,
    org_role: row.org_role,
    created_at: to_iso_string(row.created_at),
  };
}

function as_postgres_error(error: unknown): { message?: string; code?: string; detail?: string | null } | null {
  if (error && typeof error === "object") {
    const candidate = error as { message?: string; code?: string; detail?: string | null };
    return candidate;
  }

  return null;
}
