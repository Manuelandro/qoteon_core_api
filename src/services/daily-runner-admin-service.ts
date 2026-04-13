import { ForbiddenError } from "../errors/app-error";
import { DailyRunnerClient } from "../clients/daily-runner-client";
import { AccessActor, resolve_access_actor } from "../lib/access-actor";

export class DailyRunnerAdminService {
  constructor(private readonly daily_runner_client: DailyRunnerClient) {}

  private assert_admin(user: AccessActor): void {
    const actor = resolve_access_actor(user);

    if (actor.role !== "admin") {
      throw new ForbiddenError("Admin access is required");
    }
  }

  async list_projects(
    user: AccessActor,
    query?: {
      search?: string;
      organization_id?: string;
      is_enabled?: boolean;
    },
  ) {
    this.assert_admin(user);
    return this.daily_runner_client.list_projects(query);
  }

  async get_project(user: AccessActor, project_id: string) {
    this.assert_admin(user);
    return this.daily_runner_client.get_project(project_id);
  }

  async list_project_workflow_runs(user: AccessActor, project_id: string) {
    this.assert_admin(user);
    return this.daily_runner_client.list_project_workflow_runs(project_id);
  }

  async get_latest_project_workflow(user: AccessActor, project_id: string) {
    this.assert_admin(user);
    return this.daily_runner_client.get_latest_project_workflow(project_id);
  }

  async get_workflow(user: AccessActor, workflow_run_id: string) {
    this.assert_admin(user);
    return this.daily_runner_client.get_workflow(workflow_run_id);
  }

  async list_workflow_events(user: AccessActor, workflow_run_id: string) {
    this.assert_admin(user);
    return this.daily_runner_client.list_workflow_events(workflow_run_id);
  }

  async run_now(user: AccessActor, project_id: string) {
    this.assert_admin(user);
    return this.daily_runner_client.run_now(project_id);
  }

  async pause(user: AccessActor, project_id: string, reason?: string) {
    this.assert_admin(user);
    return this.daily_runner_client.pause(project_id, reason);
  }

  async resume(user: AccessActor, project_id: string) {
    this.assert_admin(user);
    return this.daily_runner_client.resume(project_id);
  }

  async update_schedule(
    user: AccessActor,
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
    this.assert_admin(user);
    return this.daily_runner_client.update_schedule(project_id, payload);
  }

  async restart_workflow(user: AccessActor, project_id: string) {
    this.assert_admin(user);
    return this.daily_runner_client.restart_workflow(project_id);
  }

  async retry_workflow_step(user: AccessActor, workflow_run_id: string, source?: string) {
    this.assert_admin(user);
    return this.daily_runner_client.retry_workflow_step(workflow_run_id, source);
  }

  async restart_workflow_run(user: AccessActor, workflow_run_id: string, source?: string) {
    this.assert_admin(user);
    return this.daily_runner_client.restart_workflow_run(workflow_run_id, source);
  }
}
