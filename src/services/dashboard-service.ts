import {
  DashboardBaseFilters,
  DashboardClusterBreakdown,
  DashboardClustersFilters,
  DashboardCompetitorBreakdown,
  DashboardCompetitorsFilters,
  DashboardModelBreakdown,
  DashboardModelsFilters,
  DashboardPromptBreakdown,
  DashboardProjectCard,
  DashboardProjectOverview,
  DashboardProjectsFilters,
  DashboardRunResults,
  DashboardTrends,
  DashboardTrendsFilters,
  DashboardVisibilitySummary,
  ProjectOnboardingProgressResponse,
} from "../domain/core";
import { DashboardLayerClient } from "../clients/dashboard-layer-client";
import { PromptRunnerClient } from "../clients/prompt-runner-client";
import { ReconcilerClient } from "../clients/reconciler-client";
import { AccessActor } from "../lib/access-actor";

import { ProjectService } from "./project-service";
import { map_project_onboarding_progress } from "./project-onboarding-progress";

export class DashboardService {
  constructor(
    private readonly project_service: ProjectService,
    private readonly prompt_runner_client: PromptRunnerClient,
    private readonly dashboard_layer_client: DashboardLayerClient,
    private readonly reconciler_client: ReconcilerClient,
  ) {}

  async get_project_overview(user: AccessActor, project_id: string): Promise<DashboardProjectOverview> {
    await this.project_service.assert_project_access(user, project_id);
    return this.dashboard_layer_client.get_project_overview(user, project_id);
  }

  async list_dashboard_projects(
    user: AccessActor,
    filters?: DashboardProjectsFilters,
  ): Promise<DashboardProjectCard[]> {
    if (filters?.organizationId) {
      await this.project_service.assert_organization_access(user, filters.organizationId);
    }

    return this.dashboard_layer_client.list_portfolio_projects(user, filters);
  }

  async get_visibility_summary(
    user: AccessActor,
    project_id: string,
    filters?: DashboardBaseFilters,
  ): Promise<DashboardVisibilitySummary> {
    await this.project_service.assert_project_access(user, project_id);
    return this.dashboard_layer_client.get_visibility_summary(user, project_id, filters);
  }

  async get_model_breakdown(
    user: AccessActor,
    project_id: string,
    filters?: DashboardModelsFilters,
  ): Promise<DashboardModelBreakdown> {
    await this.project_service.assert_project_access(user, project_id);
    return this.dashboard_layer_client.get_model_breakdown(user, project_id, filters);
  }

  async get_cluster_breakdown(
    user: AccessActor,
    project_id: string,
    filters?: DashboardClustersFilters,
  ): Promise<DashboardClusterBreakdown> {
    await this.project_service.assert_project_access(user, project_id);
    return this.dashboard_layer_client.get_cluster_breakdown(user, project_id, filters);
  }

  async get_prompt_breakdown(
    user: AccessActor,
    project_id: string,
    filters?: {
      limit?: number;
      sortBy?: "promptText" | "visibilityPercent" | "lastRunAt" | "clusterName" | "intentType" | "sourceType";
      sortDirection?: "asc" | "desc";
    },
  ): Promise<DashboardPromptBreakdown> {
    await this.project_service.assert_project_access(user, project_id);
    return this.dashboard_layer_client.get_prompt_breakdown(user, project_id, filters);
  }

  async get_competitor_breakdown(
    user: AccessActor,
    project_id: string,
    filters?: DashboardCompetitorsFilters,
  ): Promise<DashboardCompetitorBreakdown> {
    await this.project_service.assert_project_access(user, project_id);
    return this.dashboard_layer_client.get_competitor_breakdown(user, project_id, filters);
  }

  async get_trends(
    user: AccessActor,
    project_id: string,
    filters?: DashboardTrendsFilters,
  ): Promise<DashboardTrends> {
    await this.project_service.assert_project_access(user, project_id);
    return this.dashboard_layer_client.get_trends(user, project_id, filters);
  }

  async get_run_results(user: AccessActor, run_batch_id: string): Promise<DashboardRunResults> {
    const run_batch = await this.prompt_runner_client.get_run_batch(run_batch_id);
    await this.project_service.assert_project_access(user, run_batch.project_id);
    return this.dashboard_layer_client.get_run_results(user, run_batch_id);
  }

  async get_project_onboarding_progress(
    user: AccessActor,
    project_id: string,
  ): Promise<ProjectOnboardingProgressResponse> {
    await this.project_service.assert_project_access(user, project_id);
    const detail = await this.reconciler_client.get_project(project_id);

    return map_project_onboarding_progress(detail);
  }
}
