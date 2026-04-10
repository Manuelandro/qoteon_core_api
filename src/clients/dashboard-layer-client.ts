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

export interface DashboardLayerClient {
  get_project_overview(user_id: string, project_id: string): Promise<DashboardProjectOverview>;
  list_portfolio_projects(
    user_id: string,
    filters?: DashboardProjectsFilters,
  ): Promise<DashboardProjectCard[]>;
  get_visibility_summary(
    user_id: string,
    project_id: string,
    filters?: DashboardBaseFilters,
  ): Promise<DashboardVisibilitySummary>;
  get_model_breakdown(
    user_id: string,
    project_id: string,
    filters?: DashboardModelsFilters,
  ): Promise<DashboardModelBreakdown>;
  get_cluster_breakdown(
    user_id: string,
    project_id: string,
    filters?: DashboardClustersFilters,
  ): Promise<DashboardClusterBreakdown>;
  get_competitor_breakdown(
    user_id: string,
    project_id: string,
    filters?: DashboardCompetitorsFilters,
  ): Promise<DashboardCompetitorBreakdown>;
  get_trends(
    user_id: string,
    project_id: string,
    filters?: DashboardTrendsFilters,
  ): Promise<DashboardTrends>;
  get_run_results(user_id: string, run_batch_id: string): Promise<DashboardRunResults>;
}
