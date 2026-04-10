import {
  DashboardBaseFilters,
  DashboardClusterBreakdown,
  DashboardClustersFilters,
  DashboardCompetitorBreakdown,
  DashboardCompetitorsFilters,
  DashboardModelBreakdown,
  DashboardModelsFilters,
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

export class HttpDashboardLayerClient implements DashboardLayerClient {
  constructor(private readonly client: HttpJsonClient) {}

  async get_project_overview(user_id: string, project_id: string): Promise<DashboardProjectOverview> {
    return this.client.request("GET", `/projects/${project_id}/overview`, {
      headers: forwarded_user_headers(user_id),
    });
  }

  async list_portfolio_projects(
    user_id: string,
    filters?: DashboardProjectsFilters,
  ): Promise<DashboardProjectCard[]> {
    const response = await this.client.request<{ projects: DashboardProjectCard[] }>(
      "GET",
      "/portfolio/projects",
      {
        query: filters,
        headers: forwarded_user_headers(user_id),
      },
    );

    return response.projects;
  }

  async get_visibility_summary(
    user_id: string,
    project_id: string,
    filters?: DashboardBaseFilters,
  ): Promise<DashboardVisibilitySummary> {
    return this.client.request("GET", `/projects/${project_id}/visibility/summary`, {
      query: filters,
      headers: forwarded_user_headers(user_id),
    });
  }

  async get_model_breakdown(
    user_id: string,
    project_id: string,
    filters?: DashboardModelsFilters,
  ): Promise<DashboardModelBreakdown> {
    return this.client.request("GET", `/projects/${project_id}/visibility/models`, {
      query: filters,
      headers: forwarded_user_headers(user_id),
    });
  }

  async get_cluster_breakdown(
    user_id: string,
    project_id: string,
    filters?: DashboardClustersFilters,
  ): Promise<DashboardClusterBreakdown> {
    return this.client.request("GET", `/projects/${project_id}/visibility/clusters`, {
      query: filters,
      headers: forwarded_user_headers(user_id),
    });
  }

  async get_competitor_breakdown(
    user_id: string,
    project_id: string,
    filters?: DashboardCompetitorsFilters,
  ): Promise<DashboardCompetitorBreakdown> {
    return this.client.request("GET", `/projects/${project_id}/visibility/competitors`, {
      query: filters,
      headers: forwarded_user_headers(user_id),
    });
  }

  async get_trends(
    user_id: string,
    project_id: string,
    filters?: DashboardTrendsFilters,
  ): Promise<DashboardTrends> {
    return this.client.request("GET", `/projects/${project_id}/visibility/trends`, {
      query: filters,
      headers: forwarded_user_headers(user_id),
    });
  }

  async get_run_results(user_id: string, run_batch_id: string): Promise<DashboardRunResults> {
    return this.client.request("GET", `/runs/${run_batch_id}/results`, {
      headers: forwarded_user_headers(user_id),
    });
  }
}

function forwarded_user_headers(user_id: string): Record<string, string> {
  return {
    "x-qoteon-user-id": user_id,
  };
}
