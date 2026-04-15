export interface ReconcilerAdminProjectListItem {
  project_id: string;
  organization_id: string;
  organization_name: string;
  project_name: string;
  domain: string;
  project_status: string;
  reconciliation_status: string;
  current_phase: string;
  detected_state: string;
  stuck_reason_code: string | null;
  stuck_reason_message: string | null;
  latest_error_code: string | null;
  latest_error_message: string | null;
  prompt_context_status: string | null;
  prompt_count: number;
  latest_baseline_run_status: string | null;
  latest_baseline_progress: Record<string, unknown> | null;
  latest_daily_run_status: string | null;
  latest_daily_progress: Record<string, unknown> | null;
  latest_daily_parser_state: Record<string, unknown> | null;
  latest_daily_dashboard_state: Record<string, unknown> | null;
  has_usable_baseline: boolean;
  dashboard_ready: boolean;
  last_reconciliation_attempt: string | null;
  next_retry_at: string | null;
  recommended_next_action: string | null;
}

export interface ReconcilerAdminProjectDetail {
  project: {
    projectId: string;
    organizationId: string;
    organizationName: string;
    projectName: string;
    domain: string;
    companyName: string;
    primaryCategory: string;
    targetRegion: string[];
    targetLanguage: string;
    projectStatus: string;
    trackedModelLimit: number;
  };
  reconciliation_state: {
    status: string;
    current_phase: string;
    detected_state: string;
    stuck_reason_code: string | null;
    stuck_reason_message: string | null;
    latest_error_code: string | null;
    latest_error_message: string | null;
    recommended_next_action: string | null;
    last_attempt_at: string | null;
    next_retry_at?: string | null;
  } | null;
  diagnostics: {
    baselineRuns: Array<{
      id: string;
      status: string;
      created_at: string;
      started_at: string | null;
      completed_at: string | null;
    }>;
    dashboardSummary?: {
      hasData: boolean;
      runBatchId: string | null;
    };
  };
  detected_state: string;
  recommended_next_action: string;
  event_history: Array<{
    severity: string;
    step: string | null;
    message: string;
    created_at: string;
  }>;
}

export interface ReconcilerClient {
  list_projects(query?: {
    search?: string;
    status?: string;
    organization_id?: string;
    phase?: string;
  }): Promise<{ projects: ReconcilerAdminProjectListItem[] }>;
  get_project(project_id: string): Promise<ReconcilerAdminProjectDetail>;
  run_now(project_id: string): Promise<unknown>;
  retry_crawl(project_id: string): Promise<{ ok: boolean }>;
  regenerate_prompts(project_id: string): Promise<{ ok: boolean }>;
  launch_baseline(project_id: string): Promise<{ ok: boolean }>;
  restart_initial_pipeline(project_id: string, force: boolean): Promise<{ ok: boolean }>;
}
