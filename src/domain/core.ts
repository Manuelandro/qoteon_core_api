export const PLAN_TYPES = ["starter", "growth", "enterprise"] as const;
export const USER_ROLES = ["owner", "admin", "member"] as const;
export const ORGANIZATION_ROLES = ["owner", "admin", "member"] as const;
export const PROJECT_STATUSES = ["draft", "active", "paused", "archived"] as const;
export const RUN_TYPES = ["baseline", "monthly_tracking"] as const;
export const DASHBOARD_RUN_TYPES = ["baseline", "monthly_tracking", "experiment", "custom"] as const;
export const DASHBOARD_TREND_DIRECTIONS = ["up", "down", "flat", "unavailable"] as const;
export const DASHBOARD_HEALTH_FLAG_SEVERITIES = ["info", "warning", "critical"] as const;

export type PlanType = (typeof PLAN_TYPES)[number];
export type UserRole = (typeof USER_ROLES)[number];
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type RunType = (typeof RUN_TYPES)[number];
export type DashboardRunType = (typeof DASHBOARD_RUN_TYPES)[number];
export type DashboardTrendDirection = (typeof DASHBOARD_TREND_DIRECTIONS)[number];
export type DashboardHealthFlagSeverity = (typeof DASHBOARD_HEALTH_FLAG_SEVERITIES)[number];

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan_type: PlanType;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface OrganizationUser {
  id: string;
  organization_id: string;
  user_id: string;
  org_role: OrganizationRole;
  created_at: string;
}

export interface Project {
  id: string;
  organization_id: string;
  name: string;
  domain: string;
  company_name: string;
  primary_category: string;
  target_region: string;
  target_language: string;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
}

export interface ProjectCompetitor {
  id: string;
  project_id: string;
  competitor_name: string;
  competitor_domain: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthenticatedUser {
  user_id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
}

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  plan_type: PlanType;
}

export interface CreateProjectInput {
  organization_id: string;
  name: string;
  domain: string;
  company_name: string;
  primary_category: string;
  target_region: string;
  target_language: string;
  status?: ProjectStatus;
}

export interface UpdateProjectInput {
  name?: string;
  domain?: string;
  company_name?: string;
  primary_category?: string;
  target_region?: string;
  target_language?: string;
  status?: ProjectStatus;
}

export interface CreateCompetitorInput {
  competitor_name: string;
  competitor_domain: string;
  notes?: string | null;
}

export interface UpdateCompetitorInput {
  competitor_name?: string;
  competitor_domain?: string;
  notes?: string | null;
}

export interface ListProjectsFilters {
  organization_id?: string;
  status?: ProjectStatus;
}

export interface DashboardProjectsFilters {
  organizationId?: string;
  status?: ProjectStatus;
  limit?: number;
}

export interface DashboardBaseFilters {
  runBatchId?: string;
  runType?: DashboardRunType;
  startDate?: string;
  endDate?: string;
}

export interface DashboardModelsFilters extends DashboardBaseFilters {
  modelId?: string;
  limit?: number;
  sortBy?:
    | "modelName"
    | "totalExecutions"
    | "mentionRate"
    | "avgPosition"
    | "shareOfVoice"
    | "competitorPressure"
    | "visibilityScore";
  sortDirection?: "asc" | "desc";
}

export interface DashboardClustersFilters extends DashboardBaseFilters {
  clusterName?: string;
  limit?: number;
  sortBy?:
    | "clusterName"
    | "totalExecutions"
    | "mentionRate"
    | "avgPosition"
    | "shareOfVoice"
    | "competitorPressure"
    | "visibilityScore";
  sortDirection?: "asc" | "desc";
}

export interface DashboardCompetitorsFilters extends DashboardBaseFilters {
  clusterName?: string;
  limit?: number;
  sortBy?:
    | "competitorName"
    | "totalMentions"
    | "mentionRate"
    | "shareOfVoice"
    | "winsAgainstClientCount"
    | "clientVsCompetitorDelta";
  sortDirection?: "asc" | "desc";
}

export interface DashboardTrendsFilters {
  runType?: DashboardRunType;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export interface DashboardComparisonValue {
  current: number | null;
  previous: number | null;
  delta: number | null;
  percentDelta: number | null;
  direction: DashboardTrendDirection;
}

export interface DashboardSummaryComparison {
  comparedRunBatchId: string;
  overallDirection: DashboardTrendDirection;
  mentionRate: DashboardComparisonValue;
  avgPosition: DashboardComparisonValue;
  shareOfVoice: DashboardComparisonValue;
  promptCoverage: DashboardComparisonValue;
  competitorPressure: DashboardComparisonValue;
  visibilityScore: DashboardComparisonValue;
}

export interface DashboardModelCoverageSummary {
  coverageRate: number;
  totalModels: number;
  modelsWithBrandMention: number;
}

export interface DashboardVisibilitySummary {
  projectId: string;
  runBatchId: string | null;
  mentionRate: number;
  avgPosition: number | null;
  shareOfVoice: number;
  promptCoverage: number;
  modelCoverage: DashboardModelCoverageSummary;
  competitorPressure: number;
  visibilityScore: number;
  comparedToPrevious: DashboardSummaryComparison | null;
  hasData: boolean;
}

export interface DashboardMetricTrend {
  comparedRunBatchId: string | null;
  overallDirection: DashboardTrendDirection;
  mentionRateDelta: number | null;
  avgPositionDelta: number | null;
  shareOfVoiceDelta: number | null;
  competitorPressureDelta: number | null;
  visibilityScoreDelta: number | null;
}

export interface DashboardModelComparisonRow {
  aiModelId: string;
  modelName: string;
  totalExecutions: number;
  mentionRate: number;
  avgPosition: number | null;
  shareOfVoice: number;
  competitorPressure: number;
  visibilityScore: number;
  trend: DashboardMetricTrend | null;
}

export interface DashboardClusterComparisonRow {
  clusterName: string;
  totalExecutions: number;
  mentionRate: number;
  avgPosition: number | null;
  shareOfVoice: number;
  competitorPressure: number;
  visibilityScore: number;
  statusLabel: "strong" | "moderate" | "weak";
  trend: DashboardMetricTrend | null;
}

export interface DashboardCompetitorComparisonRow {
  competitorName: string;
  competitorEntityId: string | null;
  totalMentions: number;
  mentionRate: number;
  shareOfVoice: number;
  promptOverlapCount: number;
  winsAgainstClientCount: number;
  clientVsCompetitorDelta: number;
  dominantClusters: string[];
}

export interface DashboardTimeSeriesPoint {
  runBatchId: string | null;
  runType: DashboardRunType | null;
  observedAt: string;
  value: number | null;
}

export interface DashboardHealthFlag {
  code: string;
  severity: DashboardHealthFlagSeverity;
  message: string;
  context: Record<string, unknown> | null;
}

export interface DashboardProjectDescriptor {
  id: string;
  name: string;
  domain: string;
  category: string;
  language: string;
  region: string;
  status: ProjectStatus;
}

export interface DashboardRunBatchProgress {
  runBatchId: string;
  runType: DashboardRunType;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  totalExecutions: number;
  completedExecutions: number;
  failedExecutions: number;
}

export interface DashboardOverviewKeyInsights {
  strongestModel: DashboardModelComparisonRow | null;
  weakestModel: DashboardModelComparisonRow | null;
  weakestCluster: DashboardClusterComparisonRow | null;
  topCompetitor: DashboardCompetitorComparisonRow | null;
  visibilityTrendDirection: DashboardTrendDirection;
}

export interface DashboardProjectOverview {
  project: DashboardProjectDescriptor;
  latestKpis: DashboardVisibilitySummary | null;
  latestRun: DashboardRunBatchProgress | null;
  keyInsights: DashboardOverviewKeyInsights;
  healthFlags: DashboardHealthFlag[];
  previews: {
    models: DashboardModelComparisonRow[];
    clusters: DashboardClusterComparisonRow[];
    competitors: DashboardCompetitorComparisonRow[];
    recentRuns: DashboardRunBatchProgress[];
  };
}

export interface DashboardProjectCard {
  project: DashboardProjectDescriptor;
  latestKpis: DashboardVisibilitySummary | null;
  latestRun: DashboardRunBatchProgress | null;
  healthFlags: DashboardHealthFlag[];
}

export interface DashboardComparisonMetadata {
  runBatchId: string | null;
  comparedRunBatchId: string | null;
  runType: DashboardRunType | null;
  observedAt: string | null;
  totalItems: number;
  sortBy: string;
  sortDirection: "asc" | "desc";
}

export interface DashboardModelBreakdown {
  projectId: string;
  runBatchId: string | null;
  items: DashboardModelComparisonRow[];
  summary: DashboardComparisonMetadata;
}

export interface DashboardClusterBreakdown {
  projectId: string;
  runBatchId: string | null;
  items: DashboardClusterComparisonRow[];
  summary: DashboardComparisonMetadata;
}

export interface DashboardCompetitorBreakdown {
  projectId: string;
  runBatchId: string | null;
  items: DashboardCompetitorComparisonRow[];
  summary: DashboardComparisonMetadata & {
    topCompetitor: DashboardCompetitorComparisonRow | null;
    dominantClusters: Array<{
      clusterName: string;
      competitorName: string;
    }>;
  };
}

export interface DashboardTrends {
  projectId: string;
  metrics: {
    mentionRate: DashboardTimeSeriesPoint[];
    avgPosition: DashboardTimeSeriesPoint[];
    visibilityScore: DashboardTimeSeriesPoint[];
    shareOfVoice: DashboardTimeSeriesPoint[];
  };
  comparisons: {
    latestVsPreviousRun: DashboardSummaryComparison | null;
    latestMonthlyVsPreviousMonthly: DashboardSummaryComparison | null;
    baselineVsLatest: DashboardSummaryComparison | null;
  };
}

export interface DashboardRunResults {
  run: DashboardRunBatchProgress & {
    projectId: string;
  };
  kpiSummary: DashboardVisibilitySummary;
  modelSummary: DashboardModelComparisonRow[];
  clusterSummary: DashboardClusterComparisonRow[];
  competitorSummary: DashboardCompetitorComparisonRow[];
}

export interface PromptGenerationPayload {
  category?: string;
  competitors?: string[];
  personas?: string[];
  use_cases?: string[];
  features?: string[];
  integrations?: string[];
  industries?: string[];
  comparison_topics?: string[];
  faq_questions?: string[];
  region?: string;
  language?: string;
  metadata_json?: Record<string, unknown>;
}

export interface PromptGenerationResult {
  project_id: string;
  generated_count: number;
  total_prompts: number;
  active_prompts: number;
  prompt_ids: string[];
}

export interface PromptListFilters {
  status?: string;
  is_active?: boolean;
}

export interface PromptRecord {
  id: string;
  project_id: string;
  title: string;
  body?: string | null;
  cluster?: string | null;
  intent?: string | null;
  status: string;
  is_active: boolean;
  metadata_json?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

export interface PromptSyncRecord {
  source_prompt_id: string;
  runner_prompt_id: string;
}

export interface PromptSet {
  project_id: string;
  run_type: RunType;
  prompt_ids: string[];
  prompt_count: number;
  active_prompt_count: number;
}

export interface ListRunBatchesFilters {
  status?: string;
  run_type?: RunType;
  start_date?: string;
  end_date?: string;
  limit?: number;
}

export interface RunBatch {
  id: string;
  project_id: string;
  run_type: RunType;
  status: string;
  prompt_ids: string[];
  ai_model_ids: string[];
  execution_count: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  metadata_json: Record<string, unknown> | null;
}

export interface RunProgress {
  run_batch_id: string;
  status: string;
  total_executions: number;
  queued_executions: number;
  running_executions: number;
  completed_executions: number;
  failed_executions: number;
  progress_percent: number;
  updated_at?: string;
}

export interface ListExecutionsFilters {
  status?: string;
}

export interface ExecutionRecord {
  id: string;
  run_batch_id: string;
  project_id?: string;
  prompt_id: string;
  ai_model_id: string;
  status: string;
  provider: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}

export interface ServiceWarning {
  code: string;
  message: string;
  service: "core_api" | "prompt_library" | "prompt_runner" | "source_intelligence" | "dashboard_layer";
  retryable: boolean;
  details?: Record<string, unknown>;
}

export interface SourceIntelligenceCrawlTarget {
  id: string;
  project_id: string;
  target_type: "client_site" | "competitor_site";
  project_competitor_id: string | null;
  canonical_domain: string;
  start_url: string;
  is_active: boolean;
  metadata_json: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface SourceIntelligenceCrawlRun {
  id: string;
  crawl_target_id: string;
  project_id: string;
  status: "queued" | "running" | "completed" | "failed" | "partial" | "cancelled";
  trigger_type: "project_setup" | "manual" | "scheduled" | "refresh";
  scope_type: "full" | "incremental" | "single_url";
  max_pages: number;
  max_depth: number;
  pages_discovered: number;
  pages_crawled: number;
  pages_stored: number;
  started_at: string | null;
  completed_at: string | null;
  metadata_json: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface SourceIntelligencePromptContext {
  project_id: string;
  last_successful_crawl_at: string | null;
  is_ready_for_prompt_generation: boolean;
  prompt_generation_blockers: string[];
  client_website_crawl_status: "pending" | "retrying" | "passed" | "not_passed";
  client_website_crawl_message: string | null;
  client_website_crawl_attempts_made: number;
  client_website_crawl_max_attempts: number;
  crawl_coverage: {
    active_target_count: number;
    total_targets: number;
    completed_run_count: number;
    successful_target_count: number;
    total_pages: number;
    client_pages: number;
    competitor_pages: number;
    page_types: Record<string, number>;
  };
  suggested_personas: string[];
  suggested_use_cases: string[];
  suggested_features: string[];
  suggested_integrations: string[];
  suggested_industries: string[];
  suggested_comparison_topics: string[];
  suggested_faq_questions: string[];
  competitor_signal_groups: Array<{
    project_competitor_id: string;
    competitor_name: string | null;
    competitor_domain: string | null;
    personas: string[];
    use_cases: string[];
    features: string[];
    integrations: string[];
    industries: string[];
    comparison_topics: string[];
    faq_questions: string[];
  }>;
}

export interface SourceIntelligenceCrawlRequest {
  target_scope?: "client" | "competitors" | "all";
  competitor_ids?: string[];
  scope_type?: "full" | "incremental" | "single_url";
  max_pages?: number;
  max_depth?: number;
  single_url?: string;
}

export interface SetupProjectResult {
  status: "success" | "partial_success";
  project: Project;
  competitors: ProjectCompetitor[];
  prompt_generation: {
    attempted: boolean;
    succeeded: boolean;
    result: PromptGenerationResult | null;
  };
  warnings: ServiceWarning[];
}

export interface LaunchRunResult {
  prompt_set: PromptSet;
  run_batch: RunBatch;
}

export interface PromptSetSummary {
  project_id: string;
  run_type: RunType;
  prompt_count: number;
  active_prompt_count: number;
}
