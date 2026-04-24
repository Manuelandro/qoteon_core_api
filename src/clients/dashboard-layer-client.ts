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
import { AccessActor } from "../lib/access-actor";

export interface DashboardLayerClient {
  get_project_overview(user: AccessActor, project_id: string): Promise<DashboardProjectOverview>;
  list_portfolio_projects(
    user: AccessActor,
    filters?: DashboardProjectsFilters,
  ): Promise<DashboardProjectCard[]>;
  get_visibility_summary(
    user: AccessActor,
    project_id: string,
    filters?: DashboardBaseFilters,
  ): Promise<DashboardVisibilitySummary>;
  get_model_breakdown(
    user: AccessActor,
    project_id: string,
    filters?: DashboardModelsFilters,
  ): Promise<DashboardModelBreakdown>;
  get_cluster_breakdown(
    user: AccessActor,
    project_id: string,
    filters?: DashboardClustersFilters,
  ): Promise<DashboardClusterBreakdown>;
  get_prompt_breakdown(
    user: AccessActor,
    project_id: string,
    filters?: DashboardPromptsFilters,
  ): Promise<DashboardPromptBreakdown>;
  get_prompt_evidence(
    user: AccessActor,
    project_id: string,
    prompt_id: string,
    filters: DashboardPromptEvidenceFilters,
  ): Promise<DashboardPromptEvidenceResponse>;
  get_competitor_breakdown(
    user: AccessActor,
    project_id: string,
    filters?: DashboardCompetitorsFilters,
  ): Promise<DashboardCompetitorBreakdown>;
  get_trends(
    user: AccessActor,
    project_id: string,
    filters?: DashboardTrendsFilters,
  ): Promise<DashboardTrends>;
  get_run_results(user: AccessActor, run_batch_id: string): Promise<DashboardRunResults>;
}
