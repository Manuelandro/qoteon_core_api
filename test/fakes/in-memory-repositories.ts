import {
  CreateCompetitorInput,
  CreateProjectInput,
  ListProjectsFilters,
  MeteredQuotaKey,
  Organization,
  OrganizationUsageCounter,
  OrganizationUser,
  Project,
  ProjectCompetitor,
  UpdateCompetitorInput,
  UpdateProjectInput,
  User,
} from "../../src/domain/core";
import {
  AddOrganizationUserInput,
  OrganizationRepository,
} from "../../src/repositories/organization-repository";
import { OrganizationUsageRepository } from "../../src/repositories/organization-usage-repository";
import { ProjectRepository } from "../../src/repositories/project-repository";
import { UpsertUserInput, UserRepository } from "../../src/repositories/user-repository";
import { ConflictError } from "../../src/errors/app-error";

export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, User>();

  async upsert_user(input: UpsertUserInput): Promise<User> {
    const existing = this.users.get(input.id);
    const timestamp = existing?.created_at ?? now();
    const user: User = {
      id: input.id,
      email: input.email,
      full_name: input.full_name,
      role: input.role,
      created_at: timestamp,
      updated_at: now(),
    };

    this.users.set(user.id, user);
    return user;
  }

  async get_user_by_id(user_id: string): Promise<User | null> {
    return this.users.get(user_id) ?? null;
  }
}

export class InMemoryOrganizationRepository implements OrganizationRepository {
  private readonly organizations = new Map<string, Organization>();
  private readonly organizations_by_slug = new Map<string, Organization>();
  private readonly memberships = new Map<string, OrganizationUser>();
  private organization_counter = 0;
  private membership_counter = 0;

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
    const existing = this.organizations_by_slug.get(input.slug);

    if (existing) {
      throw new ConflictError("Unable to create organization", {
        database_code: "23505",
        database_details: `Key (slug)=(${input.slug}) already exists.`,
      });
    }

    const organization: Organization = {
      id: `org-${++this.organization_counter}`,
      name: input.name,
      slug: input.slug,
      plan_type: input.plan_type,
      billing_status: input.billing_status,
      project_limit: input.project_limit,
      competitor_limit: input.competitor_limit,
      tracked_model_limit: input.tracked_model_limit,
      tracked_prompts_daily_limit: input.tracked_prompts_daily_limit,
      llm_response_limit: input.llm_response_limit,
      article_draft_limit: input.article_draft_limit,
      page_improvement_limit: input.page_improvement_limit,
      crawled_page_limit: input.crawled_page_limit,
      data_retention_months: input.data_retention_months,
      trial_started_at: input.trial_started_at ?? null,
      trial_expires_at: input.trial_expires_at ?? null,
      billing_period_started_at: input.billing_period_started_at ?? null,
      billing_period_ends_at: input.billing_period_ends_at ?? null,
      stripe_customer_id: input.stripe_customer_id ?? null,
      stripe_subscription_id: input.stripe_subscription_id ?? null,
      created_at: now(),
      updated_at: now(),
    };

    this.organizations.set(organization.id, organization);
    this.organizations_by_slug.set(organization.slug, organization);
    return organization;
  }

  async get_organization_by_id(organization_id: string): Promise<Organization | null> {
    return this.organizations.get(organization_id) ?? null;
  }

  async get_organization_by_slug(slug: string): Promise<Organization | null> {
    return this.organizations_by_slug.get(slug) ?? null;
  }

  async list_all_organizations(): Promise<Organization[]> {
    return [...this.organizations.values()];
  }

  async list_organizations_for_user(user_id: string): Promise<Organization[]> {
    const organization_ids = [...this.memberships.values()]
      .filter((membership) => membership.user_id === user_id)
      .map((membership) => membership.organization_id);

    return organization_ids
      .map((organization_id) => this.organizations.get(organization_id))
      .filter((organization): organization is Organization => Boolean(organization));
  }

  async add_user_to_organization(input: AddOrganizationUserInput): Promise<OrganizationUser> {
    const membership: OrganizationUser = {
      id: `membership-${++this.membership_counter}`,
      organization_id: input.organization_id,
      user_id: input.user_id,
      org_role: input.org_role,
      created_at: now(),
    };

    this.memberships.set(this.membership_key(input.organization_id, input.user_id), membership);
    return membership;
  }

  async get_membership(
    organization_id: string,
    user_id: string,
  ): Promise<OrganizationUser | null> {
    return this.memberships.get(this.membership_key(organization_id, user_id)) ?? null;
  }

  private membership_key(organization_id: string, user_id: string): string {
    return `${organization_id}:${user_id}`;
  }
}

export class InMemoryOrganizationUsageRepository implements OrganizationUsageRepository {
  private readonly counters = new Map<string, OrganizationUsageCounter>();
  private counter = 0;

  async get_usage_counter(
    organization_id: string,
    quota_key: MeteredQuotaKey,
    period_key: string,
  ): Promise<OrganizationUsageCounter | null> {
    return this.counters.get(this.key(organization_id, quota_key, period_key)) ?? null;
  }

  async consume_usage(
    organization_id: string,
    quota_key: MeteredQuotaKey,
    period_key: string,
    amount: number,
    limit: number,
  ): Promise<OrganizationUsageCounter> {
    const key = this.key(organization_id, quota_key, period_key);
    const existing = this.counters.get(key) ?? this.create_counter(organization_id, quota_key, period_key);

    if (existing.used_count + amount > limit) {
      throw new ConflictError("Quota exceeded", {
        organization_id,
        quota_key,
        period_key,
        limit,
        used_count: existing.used_count,
        requested_amount: amount,
      });
    }

    existing.used_count += amount;
    existing.updated_at = now();
    this.counters.set(key, existing);
    return existing;
  }

  async release_usage(
    organization_id: string,
    quota_key: MeteredQuotaKey,
    period_key: string,
    amount: number,
  ): Promise<OrganizationUsageCounter> {
    const key = this.key(organization_id, quota_key, period_key);
    const existing = this.counters.get(key) ?? this.create_counter(organization_id, quota_key, period_key);
    existing.used_count = Math.max(existing.used_count - amount, 0);
    existing.updated_at = now();
    this.counters.set(key, existing);
    return existing;
  }

  private create_counter(
    organization_id: string,
    quota_key: MeteredQuotaKey,
    period_key: string,
  ): OrganizationUsageCounter {
    return {
      id: `usage-${++this.counter}`,
      organization_id,
      quota_key,
      period_key,
      used_count: 0,
      created_at: now(),
      updated_at: now(),
    };
  }

  private key(organization_id: string, quota_key: MeteredQuotaKey, period_key: string): string {
    return `${organization_id}:${quota_key}:${period_key}`;
  }
}

export class InMemoryProjectRepository implements ProjectRepository {
  private readonly projects = new Map<string, Project>();
  private readonly competitors = new Map<string, ProjectCompetitor>();
  private project_counter = 0;
  private competitor_counter = 0;

  async create_project(input: CreateProjectInput): Promise<Project> {
    const project: Project = {
      id: `project-${++this.project_counter}`,
      organization_id: input.organization_id,
      name: input.name,
      domain: input.domain,
      company_name: input.company_name,
      primary_category: input.primary_category,
      target_region: input.target_region,
      target_language: input.target_language,
      status: input.status ?? "draft",
      created_at: now(),
      updated_at: now(),
    };

    this.projects.set(project.id, project);
    return project;
  }

  async get_project_by_id(project_id: string): Promise<Project | null> {
    return this.projects.get(project_id) ?? null;
  }

  async list_projects_by_organization_ids(
    organization_ids: string[],
    filters?: ListProjectsFilters,
  ): Promise<Project[]> {
    return [...this.projects.values()].filter((project) => {
      if (!organization_ids.includes(project.organization_id)) {
        return false;
      }

      if (filters?.organization_id && project.organization_id !== filters.organization_id) {
        return false;
      }

      if (filters?.status && project.status !== filters.status) {
        return false;
      }

      return true;
    });
  }

  async update_project(project_id: string, input: UpdateProjectInput): Promise<Project | null> {
    const existing = this.projects.get(project_id);

    if (!existing) {
      return null;
    }

    const project: Project = {
      ...existing,
      ...input,
      updated_at: now(),
    };

    this.projects.set(project_id, project);
    return project;
  }

  async create_competitor(
    project_id: string,
    input: CreateCompetitorInput,
  ): Promise<ProjectCompetitor> {
    const competitor: ProjectCompetitor = {
      id: `competitor-${++this.competitor_counter}`,
      project_id,
      competitor_name: input.competitor_name,
      competitor_domain: input.competitor_domain,
      notes: input.notes ?? null,
      created_at: now(),
      updated_at: now(),
    };

    this.competitors.set(competitor.id, competitor);
    return competitor;
  }

  async create_competitors(
    project_id: string,
    inputs: CreateCompetitorInput[],
  ): Promise<ProjectCompetitor[]> {
    const created: ProjectCompetitor[] = [];

    for (const input of inputs) {
      created.push(await this.create_competitor(project_id, input));
    }

    return created;
  }

  async list_competitors(project_id: string): Promise<ProjectCompetitor[]> {
    return [...this.competitors.values()].filter((competitor) => competitor.project_id === project_id);
  }

  async update_competitor(
    project_id: string,
    competitor_id: string,
    input: UpdateCompetitorInput,
  ): Promise<ProjectCompetitor | null> {
    const existing = this.competitors.get(competitor_id);

    if (!existing || existing.project_id !== project_id) {
      return null;
    }

    const competitor: ProjectCompetitor = {
      ...existing,
      ...input,
      updated_at: now(),
    };

    this.competitors.set(competitor_id, competitor);
    return competitor;
  }

  async delete_competitor(project_id: string, competitor_id: string): Promise<boolean> {
    const existing = this.competitors.get(competitor_id);

    if (!existing || existing.project_id !== project_id) {
      return false;
    }

    this.competitors.delete(competitor_id);
    return true;
  }
}

function now(): string {
  return new Date().toISOString();
}
