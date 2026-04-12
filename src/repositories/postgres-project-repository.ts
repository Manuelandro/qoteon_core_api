import { type Pool } from "pg";

import { with_transaction, throw_postgres_error, to_iso_string } from "../db/postgres";
import { Project, ProjectCompetitor } from "../domain/core";
import { ProjectRepository } from "./project-repository";

interface ProjectRow {
  id: string;
  organization_id: string;
  name: string;
  domain: string;
  company_name: string;
  primary_category: string;
  target_region: string[];
  target_language: string;
  status: Project["status"];
  created_at: Date | string;
  updated_at: Date | string;
}

interface ProjectCompetitorRow {
  id: string;
  project_id: string;
  competitor_name: string;
  competitor_domain: string;
  notes: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export class PostgresProjectRepository implements ProjectRepository {
  constructor(private readonly pool: Pool) {}

  async create_project(input: {
    organization_id: string;
    name: string;
    domain: string;
    company_name: string;
    primary_category: string;
    target_region: string[];
    target_language: string;
    status?: Project["status"];
  }): Promise<Project> {
    try {
      const result = await this.pool.query<ProjectRow>(
        `
          INSERT INTO public.core_projects (
            organization_id,
            name,
            domain,
            company_name,
            primary_category,
            target_region,
            target_language,
            status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *
        `,
        [
          input.organization_id,
          input.name,
          input.domain,
          input.company_name,
          input.primary_category,
          input.target_region,
          input.target_language,
          input.status ?? "draft",
        ],
      );

      const row = result.rows[0];

      if (!row) {
        throw new Error("Failed to create project");
      }

      return map_project(row);
    } catch (error) {
      throw_postgres_error(as_postgres_error(error), "Unable to create project");
    }
  }

  async get_project_by_id(project_id: string): Promise<Project | null> {
    try {
      const result = await this.pool.query<ProjectRow>(
        `SELECT * FROM public.core_projects WHERE id = $1 LIMIT 1`,
        [project_id],
      );

      const row = result.rows[0];
      return row ? map_project(row) : null;
    } catch (error) {
      throw_postgres_error(as_postgres_error(error), "Unable to load project");
    }
  }

  async list_projects_by_organization_ids(
    organization_ids: string[],
    filters?: {
      organization_id?: string;
      status?: Project["status"];
    },
  ): Promise<Project[]> {
    if (organization_ids.length === 0) {
      return [];
    }

    const values: unknown[] = [organization_ids];
    const conditions = [`organization_id = ANY($1::uuid[])`];

    if (filters?.organization_id) {
      values.push(filters.organization_id);
      conditions.push(`organization_id = $${values.length}`);
    }

    if (filters?.status) {
      values.push(filters.status);
      conditions.push(`status = $${values.length}`);
    }

    try {
      const result = await this.pool.query<ProjectRow>(
        `
          SELECT *
          FROM public.core_projects
          WHERE ${conditions.join(" AND ")}
          ORDER BY created_at DESC
        `,
        values,
      );

      return result.rows.map(map_project);
    } catch (error) {
      throw_postgres_error(as_postgres_error(error), "Unable to list projects");
    }
  }

  async update_project(
    project_id: string,
    input: Partial<{
      name: string;
      domain: string;
      company_name: string;
      primary_category: string;
      target_region: string[];
      target_language: string;
      status: Project["status"];
    }>,
  ): Promise<Project | null> {
    const updates = build_update_set(input);

    if (updates.columns.length === 0) {
      return this.get_project_by_id(project_id);
    }

    try {
      const result = await this.pool.query<ProjectRow>(
        `
          UPDATE public.core_projects
          SET ${updates.columns.join(", ")},
              updated_at = timezone('utc', now())
          WHERE id = $${updates.values.length + 1}
          RETURNING *
        `,
        [...updates.values, project_id],
      );

      const row = result.rows[0];
      return row ? map_project(row) : null;
    } catch (error) {
      throw_postgres_error(as_postgres_error(error), "Unable to update project");
    }
  }

  async create_competitor(
    project_id: string,
    input: {
      competitor_name: string;
      competitor_domain: string;
      notes?: string | null;
    },
  ): Promise<ProjectCompetitor> {
    try {
      const result = await this.pool.query<ProjectCompetitorRow>(
        `
          INSERT INTO public.core_project_competitors (
            project_id,
            competitor_name,
            competitor_domain,
            notes
          )
          VALUES ($1, $2, $3, $4)
          RETURNING *
        `,
        [project_id, input.competitor_name, input.competitor_domain, input.notes ?? null],
      );

      const row = result.rows[0];

      if (!row) {
        throw new Error("Failed to create competitor");
      }

      return map_competitor(row);
    } catch (error) {
      throw_postgres_error(as_postgres_error(error), "Unable to create competitor");
    }
  }

  async create_competitors(
    project_id: string,
    inputs: Array<{
      competitor_name: string;
      competitor_domain: string;
      notes?: string | null;
    }>,
  ): Promise<ProjectCompetitor[]> {
    if (inputs.length === 0) {
      return [];
    }

    return with_transaction(this.pool, async (client) => {
      const competitors: ProjectCompetitor[] = [];

      for (const input of inputs) {
        const result = await client.query<ProjectCompetitorRow>(
          `
            INSERT INTO public.core_project_competitors (
              project_id,
              competitor_name,
              competitor_domain,
              notes
            )
            VALUES ($1, $2, $3, $4)
            RETURNING *
          `,
          [project_id, input.competitor_name, input.competitor_domain, input.notes ?? null],
        );

        const row = result.rows[0];

        if (row) {
          competitors.push(map_competitor(row));
        }
      }

      return competitors;
    }).catch((error: unknown) => {
      throw_postgres_error(as_postgres_error(error), "Unable to create competitors");
    });
  }

  async list_competitors(project_id: string): Promise<ProjectCompetitor[]> {
    try {
      const result = await this.pool.query<ProjectCompetitorRow>(
        `
          SELECT *
          FROM public.core_project_competitors
          WHERE project_id = $1
          ORDER BY created_at ASC
        `,
        [project_id],
      );

      return result.rows.map(map_competitor);
    } catch (error) {
      throw_postgres_error(as_postgres_error(error), "Unable to list competitors");
    }
  }

  async update_competitor(
    project_id: string,
    competitor_id: string,
    input: Partial<{
      competitor_name: string;
      competitor_domain: string;
      notes: string | null;
    }>,
  ): Promise<ProjectCompetitor | null> {
    const updates = build_update_set(input);

    if (updates.columns.length === 0) {
      const competitors = await this.list_competitors(project_id);
      return competitors.find((competitor) => competitor.id === competitor_id) ?? null;
    }

    try {
      const result = await this.pool.query<ProjectCompetitorRow>(
        `
          UPDATE public.core_project_competitors
          SET ${updates.columns.join(", ")},
              updated_at = timezone('utc', now())
          WHERE project_id = $${updates.values.length + 1}
            AND id = $${updates.values.length + 2}
          RETURNING *
        `,
        [...updates.values, project_id, competitor_id],
      );

      const row = result.rows[0];
      return row ? map_competitor(row) : null;
    } catch (error) {
      throw_postgres_error(as_postgres_error(error), "Unable to update competitor");
    }
  }

  async delete_competitor(project_id: string, competitor_id: string): Promise<boolean> {
    try {
      const result = await this.pool.query<{ id: string }>(
        `
          DELETE FROM public.core_project_competitors
          WHERE project_id = $1 AND id = $2
          RETURNING id
        `,
        [project_id, competitor_id],
      );

      return Boolean(result.rows[0]);
    } catch (error) {
      throw_postgres_error(as_postgres_error(error), "Unable to delete competitor");
    }
  }
}

function map_project(row: ProjectRow): Project {
  return {
    id: row.id,
    organization_id: row.organization_id,
    name: row.name,
    domain: row.domain,
    company_name: row.company_name,
    primary_category: row.primary_category,
    target_region: row.target_region,
    target_language: row.target_language,
    status: row.status,
    created_at: to_iso_string(row.created_at),
    updated_at: to_iso_string(row.updated_at),
  };
}

function map_competitor(row: ProjectCompetitorRow): ProjectCompetitor {
  return {
    id: row.id,
    project_id: row.project_id,
    competitor_name: row.competitor_name,
    competitor_domain: row.competitor_domain,
    notes: row.notes,
    created_at: to_iso_string(row.created_at),
    updated_at: to_iso_string(row.updated_at),
  };
}

function build_update_set(input: Record<string, unknown>): {
  columns: string[];
  values: unknown[];
} {
  const columns: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) {
      continue;
    }

    values.push(value);
    columns.push(`${key} = $${values.length}`);
  }

  return { columns, values };
}

function as_postgres_error(error: unknown): { message?: string; code?: string; detail?: string | null } | null {
  if (error && typeof error === "object") {
    const candidate = error as { message?: string; code?: string; detail?: string | null };
    return candidate;
  }

  return null;
}
