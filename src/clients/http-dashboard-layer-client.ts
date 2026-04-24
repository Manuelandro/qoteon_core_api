import {
  DashboardBaseFilters,
  DashboardClusterBreakdown,
  DashboardClustersFilters,
  DashboardCompetitorBreakdown,
  DashboardCompetitorsFilters,
  DashboardModelBreakdown,
  DashboardModelsFilters,
  DashboardPromptEvidenceFilters,
  DashboardPromptEvidenceResponse,
  DashboardPromptBreakdown,
  DashboardPromptsFilters,
  DashboardProjectCard,
  DashboardProjectOverview,
  DashboardProjectsFilters,
  DashboardRunResults,
  DashboardTrends,
  DashboardTrendsFilters,
  DashboardVisibilitySummary,
} from "../domain/core";
import { HttpJsonClient } from "./http-client";
import { DashboardLayerClient } from "./dashboard-layer-client";
import { AccessActor, resolve_access_actor } from "../lib/access-actor";

export class HttpDashboardLayerClient implements DashboardLayerClient {
  constructor(private readonly client: HttpJsonClient) {}

  async get_project_overview(user: AccessActor, project_id: string): Promise<DashboardProjectOverview> {
    return this.client.request("GET", `/projects/${project_id}/overview`, {
      headers: forwarded_user_headers(user),
    });
  }

  async list_portfolio_projects(
    user: AccessActor,
    filters?: DashboardProjectsFilters,
  ): Promise<DashboardProjectCard[]> {
    const response = await this.client.request<{ projects: DashboardProjectCard[] }>(
      "GET",
      "/portfolio/projects",
      {
        query: filters,
        headers: forwarded_user_headers(user),
      },
    );

    return response.projects;
  }

  async get_visibility_summary(
    user: AccessActor,
    project_id: string,
    filters?: DashboardBaseFilters,
  ): Promise<DashboardVisibilitySummary> {
    return this.client.request("GET", `/projects/${project_id}/visibility/summary`, {
      query: filters,
      headers: forwarded_user_headers(user),
    });
  }

  async get_model_breakdown(
    user: AccessActor,
    project_id: string,
    filters?: DashboardModelsFilters,
  ): Promise<DashboardModelBreakdown> {
    return this.client.request("GET", `/projects/${project_id}/visibility/models`, {
      query: filters,
      headers: forwarded_user_headers(user),
    });
  }

  async get_cluster_breakdown(
    user: AccessActor,
    project_id: string,
    filters?: DashboardClustersFilters,
  ): Promise<DashboardClusterBreakdown> {
    return this.client.request("GET", `/projects/${project_id}/visibility/clusters`, {
      query: filters,
      headers: forwarded_user_headers(user),
    });
  }

  async get_prompt_breakdown(
    user: AccessActor,
    project_id: string,
    filters?: DashboardPromptsFilters,
  ): Promise<DashboardPromptBreakdown> {
    return this.client.request("GET", `/projects/${project_id}/visibility/prompts`, {
      query: filters,
      headers: forwarded_user_headers(user),
    });
  }

  async get_prompt_evidence(
    user: AccessActor,
    project_id: string,
    prompt_id: string,
    filters: DashboardPromptEvidenceFilters,
  ): Promise<DashboardPromptEvidenceResponse> {
    return this.client.request("GET", `/projects/${project_id}/visibility/prompts/${prompt_id}/evidence`, {
      query: filters,
      headers: forwarded_user_headers(user),
    });
  }

  async get_competitor_breakdown(
    user: AccessActor,
    project_id: string,
    filters?: DashboardCompetitorsFilters,
  ): Promise<DashboardCompetitorBreakdown> {
    return this.client.request("GET", `/projects/${project_id}/visibility/competitors`, {
      query: filters,
      headers: forwarded_user_headers(user),
    });
  }

  async get_trends(
    user: AccessActor,
    project_id: string,
    filters?: DashboardTrendsFilters,
  ): Promise<DashboardTrends> {
    return this.client.request("GET", `/projects/${project_id}/visibility/trends`, {
      query: filters,
      headers: forwarded_user_headers(user),
    });
  }

  async get_run_results(user: AccessActor, run_batch_id: string): Promise<DashboardRunResults> {
    return this.client.request("GET", `/runs/${run_batch_id}/results`, {
      headers: forwarded_user_headers(user),
    });
  }
}

function forwarded_user_headers(user: AccessActor): Record<string, string> {
  const actor = resolve_access_actor(user);

  return {
    "x-qoteon-user-id": actor.user_id,
    "x-qoteon-user-role": actor.role,
  };
}
