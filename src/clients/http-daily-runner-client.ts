import { HttpJsonClient } from "./http-client";
import {
  DailyRunnerClient,
  DailyRunnerWorkflowEvent,
  DailyRunnerWorkflowRun,
} from "./daily-runner-client";

export class HttpDailyRunnerClient implements DailyRunnerClient {
  constructor(private readonly client: HttpJsonClient) {}

  list_projects(query?: {
    search?: string;
    organization_id?: string;
    is_enabled?: boolean;
  }) {
    return this.client.request<{ projects: unknown[] }>("GET", "/internal/schedules/projects", {
      query,
    });
  }

  get_project(project_id: string) {
    return this.client.request("GET", `/internal/schedules/projects/${project_id}`);
  }

  list_project_workflow_runs(project_id: string) {
    return this.client.request<{ workflow_runs: unknown[] }>(
      "GET",
      `/internal/projects/${project_id}/workflow-runs`,
    );
  }

  get_latest_project_workflow(project_id: string) {
    return this.client.request<{
      workflow_run: DailyRunnerWorkflowRun | null;
      recent_events: DailyRunnerWorkflowEvent[];
    }>("GET", `/internal/projects/${project_id}/workflows/latest`);
  }

  get_workflow(workflow_run_id: string) {
    return this.client.request("GET", `/internal/workflows/${workflow_run_id}`);
  }

  list_workflow_events(workflow_run_id: string) {
    return this.client.request<{ events: DailyRunnerWorkflowEvent[] }>(
      "GET",
      `/internal/workflows/${workflow_run_id}/events`,
    );
  }

  run_now(project_id: string) {
    return this.client.request("POST", `/internal/projects/${project_id}/schedule/run-now`);
  }

  pause(project_id: string, reason?: string) {
    return this.client.request("POST", `/internal/projects/${project_id}/schedule/pause`, {
      body: reason ? { reason } : {},
    });
  }

  resume(project_id: string) {
    return this.client.request("POST", `/internal/projects/${project_id}/schedule/resume`);
  }

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
  ) {
    return this.client.request("POST", `/internal/projects/${project_id}/schedule/update`, {
      body: payload,
    });
  }

  restart_workflow(project_id: string) {
    return this.client.request("POST", `/internal/projects/${project_id}/workflow-restart`);
  }

  retry_workflow_step(workflow_run_id: string, source?: string) {
    return this.client.request("POST", `/internal/workflows/${workflow_run_id}/recovery/retry-step`, {
      body: source ? { source } : {},
    });
  }

  restart_workflow_run(workflow_run_id: string, source?: string) {
    return this.client.request("POST", `/internal/workflows/${workflow_run_id}/recovery/restart`, {
      body: source ? { source } : {},
    });
  }
}
