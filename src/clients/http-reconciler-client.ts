import { HttpJsonClient } from "./http-client";
import {
  ReconcilerAdminProjectDetail,
  ReconcilerAdminProjectListItem,
  ReconcilerClient,
} from "./reconciler-client";

export class HttpReconcilerClient implements ReconcilerClient {
  constructor(private readonly client: HttpJsonClient) {}

  list_projects(query?: {
    search?: string;
    status?: string;
    organization_id?: string;
    phase?: string;
  }): Promise<{ projects: ReconcilerAdminProjectListItem[] }> {
    return this.client.request("GET", "/internal/projects/reconciliation", {
      query,
    });
  }

  get_project(project_id: string): Promise<ReconcilerAdminProjectDetail> {
    return this.client.request("GET", `/internal/projects/${project_id}/reconciliation`);
  }

  run_now(project_id: string): Promise<unknown> {
    return this.client.request("POST", `/internal/projects/${project_id}/reconciliation/run-now`);
  }

  retry_crawl(project_id: string): Promise<{ ok: boolean }> {
    return this.client.request("POST", `/internal/projects/${project_id}/recovery/retry-crawl`);
  }

  regenerate_prompts(project_id: string): Promise<{ ok: boolean }> {
    return this.client.request("POST", `/internal/projects/${project_id}/recovery/regenerate-prompts`);
  }

  launch_baseline(project_id: string): Promise<{ ok: boolean }> {
    return this.client.request("POST", `/internal/projects/${project_id}/recovery/launch-baseline`);
  }

  restart_initial_pipeline(project_id: string, force: boolean): Promise<{ ok: boolean }> {
    return this.client.request(
      "POST",
      `/internal/projects/${project_id}/recovery/restart-initial-pipeline`,
      {
        body: { force },
      },
    );
  }
}
