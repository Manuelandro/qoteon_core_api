import { SupabaseClient } from "@supabase/supabase-js";

import { Project, ProjectCompetitor, ListProjectsFilters } from "../domain/core";
import { throw_supabase_error } from "../lib/supabase";
import { ProjectRepository } from "./project-repository";

export class SupabaseProjectRepository implements ProjectRepository {
  constructor(private readonly client: SupabaseClient) {}

  async create_project(input: {
    organization_id: string;
    name: string;
    domain: string;
    company_name: string;
    primary_category: string;
    target_region: string;
    target_language: string;
    status?: Project["status"];
  }): Promise<Project> {
    const { data, error } = await this.client
      .from("projects")
      .insert({
        organization_id: input.organization_id,
        name: input.name,
        domain: input.domain,
        company_name: input.company_name,
        primary_category: input.primary_category,
        target_region: input.target_region,
        target_language: input.target_language,
        status: input.status ?? "draft",
      })
      .select("*")
      .single();

    if (error || !data) {
      throw_supabase_error(error, "Unable to create project");
    }

    return data as Project;
  }

  async get_project_by_id(project_id: string): Promise<Project | null> {
    const { data, error } = await this.client
      .from("projects")
      .select("*")
      .eq("id", project_id)
      .maybeSingle();

    if (error) {
      throw_supabase_error(error, "Unable to load project");
    }

    return (data as Project | null) ?? null;
  }

  async list_projects_by_organization_ids(
    organization_ids: string[],
    filters?: ListProjectsFilters,
  ): Promise<Project[]> {
    if (organization_ids.length === 0) {
      return [];
    }

    let query = this.client
      .from("projects")
      .select("*")
      .in("organization_id", organization_ids)
      .order("created_at", { ascending: false });

    if (filters?.organization_id) {
      query = query.eq("organization_id", filters.organization_id);
    }

    if (filters?.status) {
      query = query.eq("status", filters.status);
    }

    const { data, error } = await query;

    if (error) {
      throw_supabase_error(error, "Unable to list projects");
    }

    return (data ?? []) as Project[];
  }

  async update_project(
    project_id: string,
    input: Partial<{
      name: string;
      domain: string;
      company_name: string;
      primary_category: string;
      target_region: string;
      target_language: string;
      status: Project["status"];
    }>,
  ): Promise<Project | null> {
    const payload = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    );

    const { data, error } = await this.client
      .from("projects")
      .update(payload)
      .eq("id", project_id)
      .select("*")
      .maybeSingle();

    if (error) {
      throw_supabase_error(error, "Unable to update project");
    }

    return (data as Project | null) ?? null;
  }

  async create_competitor(
    project_id: string,
    input: {
      competitor_name: string;
      competitor_domain: string;
      notes?: string | null;
    },
  ): Promise<ProjectCompetitor> {
    const { data, error } = await this.client
      .from("project_competitors")
      .insert({
        project_id,
        competitor_name: input.competitor_name,
        competitor_domain: input.competitor_domain,
        notes: input.notes ?? null,
      })
      .select("*")
      .single();

    if (error || !data) {
      throw_supabase_error(error, "Unable to create competitor");
    }

    return data as ProjectCompetitor;
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

    const { data, error } = await this.client
      .from("project_competitors")
      .insert(
        inputs.map((input) => ({
          project_id,
          competitor_name: input.competitor_name,
          competitor_domain: input.competitor_domain,
          notes: input.notes ?? null,
        })),
      )
      .select("*");

    if (error) {
      throw_supabase_error(error, "Unable to create competitors");
    }

    return (data ?? []) as ProjectCompetitor[];
  }

  async list_competitors(project_id: string): Promise<ProjectCompetitor[]> {
    const { data, error } = await this.client
      .from("project_competitors")
      .select("*")
      .eq("project_id", project_id)
      .order("created_at", { ascending: true });

    if (error) {
      throw_supabase_error(error, "Unable to list competitors");
    }

    return (data ?? []) as ProjectCompetitor[];
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
    const payload = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    );

    const { data, error } = await this.client
      .from("project_competitors")
      .update(payload)
      .eq("project_id", project_id)
      .eq("id", competitor_id)
      .select("*")
      .maybeSingle();

    if (error) {
      throw_supabase_error(error, "Unable to update competitor");
    }

    return (data as ProjectCompetitor | null) ?? null;
  }

  async delete_competitor(project_id: string, competitor_id: string): Promise<boolean> {
    const { data, error } = await this.client
      .from("project_competitors")
      .delete()
      .eq("project_id", project_id)
      .eq("id", competitor_id)
      .select("id")
      .maybeSingle();

    if (error) {
      throw_supabase_error(error, "Unable to delete competitor");
    }

    return Boolean(data);
  }
}
