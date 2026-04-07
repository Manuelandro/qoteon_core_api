import {
  CreateCompetitorInput,
  CreateProjectInput,
  ListProjectsFilters,
  Organization,
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
import { ProjectRepository } from "../../src/repositories/project-repository";
import { UpsertUserInput, UserRepository } from "../../src/repositories/user-repository";

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
  private readonly memberships = new Map<string, OrganizationUser>();
  private organization_counter = 0;
  private membership_counter = 0;

  async create_organization(input: {
    name: string;
    slug: string;
    plan_type: Organization["plan_type"];
  }): Promise<Organization> {
    const organization: Organization = {
      id: `org-${++this.organization_counter}`,
      name: input.name,
      slug: input.slug,
      plan_type: input.plan_type,
      created_at: now(),
      updated_at: now(),
    };

    this.organizations.set(organization.id, organization);
    return organization;
  }

  async get_organization_by_id(organization_id: string): Promise<Organization | null> {
    return this.organizations.get(organization_id) ?? null;
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
