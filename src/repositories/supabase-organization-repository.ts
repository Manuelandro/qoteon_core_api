import { SupabaseClient } from "@supabase/supabase-js";

import { Organization, OrganizationUser } from "../domain/core";
import { throw_supabase_error } from "../lib/supabase";
import {
  AddOrganizationUserInput,
  OrganizationRepository,
} from "./organization-repository";

export class SupabaseOrganizationRepository implements OrganizationRepository {
  constructor(private readonly client: SupabaseClient) {}

  async create_organization(input: {
    name: string;
    slug: string;
    plan_type: Organization["plan_type"];
  }): Promise<Organization> {
    const { data, error } = await this.client
      .from("organizations")
      .insert({
        name: input.name,
        slug: input.slug,
        plan_type: input.plan_type,
      })
      .select("*")
      .single();

    if (error || !data) {
      throw_supabase_error(error, "Unable to create organization");
    }

    return data as Organization;
  }

  async get_organization_by_id(organization_id: string): Promise<Organization | null> {
    const { data, error } = await this.client
      .from("organizations")
      .select("*")
      .eq("id", organization_id)
      .maybeSingle();

    if (error) {
      throw_supabase_error(error, "Unable to load organization");
    }

    return (data as Organization | null) ?? null;
  }

  async list_organizations_for_user(user_id: string): Promise<Organization[]> {
    const membership_result = await this.client
      .from("organization_users")
      .select("organization_id")
      .eq("user_id", user_id);

    if (membership_result.error) {
      throw_supabase_error(membership_result.error, "Unable to list organizations");
    }

    const organization_ids = (membership_result.data ?? []).map(
      (membership) => membership.organization_id as string,
    );

    if (organization_ids.length === 0) {
      return [];
    }

    const { data, error } = await this.client
      .from("organizations")
      .select("*")
      .in("id", organization_ids)
      .order("created_at", { ascending: false });

    if (error) {
      throw_supabase_error(error, "Unable to list organizations");
    }

    return (data ?? []) as Organization[];
  }

  async add_user_to_organization(input: AddOrganizationUserInput): Promise<OrganizationUser> {
    const { data, error } = await this.client
      .from("organization_users")
      .insert({
        organization_id: input.organization_id,
        user_id: input.user_id,
        org_role: input.org_role,
      })
      .select("*")
      .single();

    if (error || !data) {
      throw_supabase_error(error, "Unable to add organization membership");
    }

    return data as OrganizationUser;
  }

  async get_membership(
    organization_id: string,
    user_id: string,
  ): Promise<OrganizationUser | null> {
    const { data, error } = await this.client
      .from("organization_users")
      .select("*")
      .eq("organization_id", organization_id)
      .eq("user_id", user_id)
      .maybeSingle();

    if (error) {
      throw_supabase_error(error, "Unable to load organization membership");
    }

    return (data as OrganizationUser | null) ?? null;
  }
}
