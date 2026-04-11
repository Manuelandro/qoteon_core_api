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
} from "../domain/core";
import { ForbiddenError, NotFoundError } from "../errors/app-error";
import { AccessActor, resolve_access_actor } from "../lib/access-actor";
import { OrganizationRepository } from "../repositories/organization-repository";
import { ProjectRepository } from "../repositories/project-repository";

export class ProjectService {
  constructor(
    private readonly organization_repository: OrganizationRepository,
    private readonly project_repository: ProjectRepository,
  ) {}

  async assert_organization_access(
    user: AccessActor,
    organization_id: string,
  ): Promise<{ organization: Organization; membership: OrganizationUser | null }> {
    const actor = resolve_access_actor(user);
    const organization = await this.organization_repository.get_organization_by_id(organization_id);

    if (!organization) {
      throw new NotFoundError("Organization not found");
    }

    if (actor.role === "admin") {
      return { organization, membership: null };
    }

    const membership = await this.organization_repository.get_membership(organization_id, actor.user_id);

    if (!membership) {
      throw new ForbiddenError("You do not have access to this organization");
    }

    return { organization, membership };
  }

  async assert_project_access(user: AccessActor, project_id: string): Promise<Project> {
    const project = await this.project_repository.get_project_by_id(project_id);

    if (!project) {
      throw new NotFoundError("Project not found");
    }

    await this.assert_organization_access(user, project.organization_id);

    return project;
  }

  async create_project(user: AccessActor, input: CreateProjectInput): Promise<Project> {
    await this.assert_organization_access(user, input.organization_id);
    return this.project_repository.create_project(input);
  }

  async get_project(user: AccessActor, project_id: string): Promise<Project> {
    return this.assert_project_access(user, project_id);
  }

  async list_projects(user: AccessActor, filters?: ListProjectsFilters): Promise<Project[]> {
    const actor = resolve_access_actor(user);

    if (filters?.organization_id) {
      await this.assert_organization_access(actor, filters.organization_id);
      return this.project_repository.list_projects_by_organization_ids([filters.organization_id], filters);
    }

    const organizations =
      actor.role === "admin"
        ? await this.organization_repository.list_all_organizations()
        : await this.organization_repository.list_organizations_for_user(actor.user_id);

    return this.project_repository.list_projects_by_organization_ids(
      organizations.map((organization) => organization.id),
      filters,
    );
  }

  async update_project(
    user: AccessActor,
    project_id: string,
    input: UpdateProjectInput,
  ): Promise<Project> {
    await this.assert_project_access(user, project_id);
    const project = await this.project_repository.update_project(project_id, input);

    if (!project) {
      throw new NotFoundError("Project not found");
    }

    return project;
  }

  async create_competitor(
    user: AccessActor,
    project_id: string,
    input: CreateCompetitorInput,
  ): Promise<ProjectCompetitor> {
    await this.assert_project_access(user, project_id);
    return this.project_repository.create_competitor(project_id, input);
  }

  async create_competitors(
    user: AccessActor,
    project_id: string,
    inputs: CreateCompetitorInput[],
  ): Promise<ProjectCompetitor[]> {
    await this.assert_project_access(user, project_id);
    return this.project_repository.create_competitors(project_id, inputs);
  }

  async list_competitors(user: AccessActor, project_id: string): Promise<ProjectCompetitor[]> {
    await this.assert_project_access(user, project_id);
    return this.project_repository.list_competitors(project_id);
  }

  async update_competitor(
    user: AccessActor,
    project_id: string,
    competitor_id: string,
    input: UpdateCompetitorInput,
  ): Promise<ProjectCompetitor> {
    await this.assert_project_access(user, project_id);
    const competitor = await this.project_repository.update_competitor(project_id, competitor_id, input);

    if (!competitor) {
      throw new NotFoundError("Competitor not found");
    }

    return competitor;
  }

  async delete_competitor(
    user: AccessActor,
    project_id: string,
    competitor_id: string,
  ): Promise<void> {
    await this.assert_project_access(user, project_id);
    const deleted = await this.project_repository.delete_competitor(project_id, competitor_id);

    if (!deleted) {
      throw new NotFoundError("Competitor not found");
    }
  }
}
