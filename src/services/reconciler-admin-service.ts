import { ForbiddenError } from "../errors/app-error";
import { AccessActor, resolve_access_actor } from "../lib/access-actor";
import { ReconcilerClient } from "../clients/reconciler-client";

export class ReconcilerAdminService {
  constructor(private readonly reconciler_client: ReconcilerClient) {}

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
      status?: string;
      organization_id?: string;
      phase?: string;
    },
  ) {
    this.assert_admin(user);
    return this.reconciler_client.list_projects(query);
  }

  async get_project(user: AccessActor, project_id: string) {
    this.assert_admin(user);
    return this.reconciler_client.get_project(project_id);
  }

  async run_now(user: AccessActor, project_id: string) {
    this.assert_admin(user);
    return this.reconciler_client.run_now(project_id);
  }

  async retry_crawl(user: AccessActor, project_id: string) {
    this.assert_admin(user);
    return this.reconciler_client.retry_crawl(project_id);
  }

  async regenerate_prompts(user: AccessActor, project_id: string) {
    this.assert_admin(user);
    return this.reconciler_client.regenerate_prompts(project_id);
  }

  async launch_baseline(user: AccessActor, project_id: string) {
    this.assert_admin(user);
    return this.reconciler_client.launch_baseline(project_id);
  }

  async restart_initial_pipeline(user: AccessActor, project_id: string, force: boolean) {
    this.assert_admin(user);
    return this.reconciler_client.restart_initial_pipeline(project_id, force);
  }
}
