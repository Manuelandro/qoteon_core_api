import {
  CreateCompetitorInput,
  CreateProjectInput,
  ListProjectsFilters,
  Project,
  ProjectCompetitor,
  UpdateCompetitorInput,
  UpdateProjectInput,
} from "../domain/core";

export interface ProjectRepository {
  create_project(input: CreateProjectInput): Promise<Project>;
  get_project_by_id(project_id: string): Promise<Project | null>;
  list_projects_by_organization_ids(
    organization_ids: string[],
    filters?: ListProjectsFilters,
  ): Promise<Project[]>;
  update_project(project_id: string, input: UpdateProjectInput): Promise<Project | null>;
  create_competitor(
    project_id: string,
    input: CreateCompetitorInput,
  ): Promise<ProjectCompetitor>;
  create_competitors(
    project_id: string,
    inputs: CreateCompetitorInput[],
  ): Promise<ProjectCompetitor[]>;
  list_competitors(project_id: string): Promise<ProjectCompetitor[]>;
  update_competitor(
    project_id: string,
    competitor_id: string,
    input: UpdateCompetitorInput,
  ): Promise<ProjectCompetitor | null>;
  delete_competitor(project_id: string, competitor_id: string): Promise<boolean>;
}
