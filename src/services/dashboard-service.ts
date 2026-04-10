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
import { DashboardLayerClient } from "../clients/dashboard-layer-client";
import { PromptRunnerClient } from "../clients/prompt-runner-client";

import { ProjectService } from "./project-service";

export class DashboardService {
  constructor(
    private readonly project_service: ProjectService,
    private readonly prompt_runner_client: PromptRunnerClient,
    private readonly dashboard_layer_client: DashboardLayerClient,
  ) {}

  async get_project_overview(user_id: string, project_id: string): Promise<DashboardProjectOverview> {
    await this.project_service.assert_project_access(user_id, project_id);
    return this.dashboard_layer_client.get_project_overview(user_id, project_id);
  }

  async list_dashboard_projects(
    user_id: string,
    filters?: DashboardProjectsFilters,
  ): Promise<DashboardProjectCard[]> {
    if (filters?.organizationId) {
      await this.project_service.assert_organization_access(user_id, filters.organizationId);
    }

    return this.dashboard_layer_client.list_portfolio_projects(user_id, filters);
  }

  async get_visibility_summary(
    user_id: string,
    project_id: string,
    filters?: DashboardBaseFilters,
  ): Promise<DashboardVisibilitySummary> {
    await this.project_service.assert_project_access(user_id, project_id);
    return this.dashboard_layer_client.get_visibility_summary(user_id, project_id, filters);
  }

  async get_model_breakdown(
    user_id: string,
    project_id: string,
    filters?: DashboardModelsFilters,
  ): Promise<DashboardModelBreakdown> {
    await this.project_service.assert_project_access(user_id, project_id);
    return this.dashboard_layer_client.get_model_breakdown(user_id, project_id, filters);
  }

  async get_cluster_breakdown(
    user_id: string,
    project_id: string,
    filters?: DashboardClustersFilters,
  ): Promise<DashboardClusterBreakdown> {
    await this.project_service.assert_project_access(user_id, project_id);
    return this.dashboard_layer_client.get_cluster_breakdown(user_id, project_id, filters);
  }

  async get_competitor_breakdown(
    user_id: string,
    project_id: string,
    filters?: DashboardCompetitorsFilters,
  ): Promise<DashboardCompetitorBreakdown> {
    await this.project_service.assert_project_access(user_id, project_id);
    return this.dashboard_layer_client.get_competitor_breakdown(user_id, project_id, filters);
  }

  async get_trends(
    user_id: string,
    project_id: string,
    filters?: DashboardTrendsFilters,
  ): Promise<DashboardTrends> {
    await this.project_service.assert_project_access(user_id, project_id);
    return this.dashboard_layer_client.get_trends(user_id, project_id, filters);
  }

  async get_run_results(user_id: string, run_batch_id: string): Promise<DashboardRunResults> {
    const run_batch = await this.prompt_runner_client.get_run_batch(run_batch_id);
    await this.project_service.assert_project_access(user_id, run_batch.project_id);
    return this.dashboard_layer_client.get_run_results(user_id, run_batch_id);
  }
}
