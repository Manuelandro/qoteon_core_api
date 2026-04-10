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
  }): Promise<Organization> {
    try {
      const result = await this.pool.query<OrganizationRow>(
        `
          INSERT INTO public.core_organizations (
            name,
            slug,
            plan_type
          )
          VALUES ($1, $2, $3)
          RETURNING *
        `,
        [input.name, input.slug, input.plan_type],
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
