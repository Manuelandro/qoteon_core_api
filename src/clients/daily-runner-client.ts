export interface DailyRunnerWorkflowEvent {
  severity: "info" | "warning" | "error";
  step: string | null;
  message: string;
  created_at: string;
}

export interface DailyRunnerWorkflowRun {
  id: string;
  status: string;
  current_step: string;
  failure_step: string | null;
  recovery_state: string;
  recovery_attempt_count: number;
  last_recovery_source: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  core_run_batch_id: string | null;
  created_at: string;
  started_at: string;
  completed_at: string | null;
}

export interface DailyRunnerClient {
  list_projects(query?: {
    search?: string;
    organization_id?: string;
    is_enabled?: boolean;
  }): Promise<{ projects: unknown[] }>;
  get_project(project_id: string): Promise<unknown>;
  list_project_workflow_runs(project_id: string): Promise<{ workflow_runs: unknown[] }>;
  get_latest_project_workflow(project_id: string): Promise<{
    workflow_run: DailyRunnerWorkflowRun | null;
    recent_events: DailyRunnerWorkflowEvent[];
  }>;
  get_workflow(workflow_run_id: string): Promise<unknown>;
  list_workflow_events(workflow_run_id: string): Promise<{ events: DailyRunnerWorkflowEvent[] }>;
  run_now(project_id: string): Promise<unknown>;
  pause(project_id: string, reason?: string): Promise<unknown>;
  resume(project_id: string): Promise<unknown>;
  update_schedule(
    project_id: string,
    payload: {
      timezone?: string;
      run_at_local_time?: string;
      is_enabled?: boolean;
      refresh_crawl_enabled?: boolean;
      regenerate_prompts_enabled?: boolean;
      launch_daily_tracking_enabled?: boolean;
      paused_reason?: string | null;
    },
  ): Promise<unknown>;
  restart_workflow(project_id: string): Promise<unknown>;
  retry_workflow_step(workflow_run_id: string, source?: string): Promise<unknown>;
  restart_workflow_run(workflow_run_id: string, source?: string): Promise<unknown>;
}
