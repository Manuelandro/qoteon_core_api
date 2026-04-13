import { ForbiddenError } from "../errors/app-error";
import { AccessActor, resolve_access_actor } from "../lib/access-actor";
import {
  DailyRunnerClient,
  DailyRunnerWorkflowEvent,
  DailyRunnerWorkflowRun,
} from "../clients/daily-runner-client";
import {
  ReconcilerAdminProjectDetail,
  ReconcilerAdminProjectListItem,
  ReconcilerClient,
} from "../clients/reconciler-client";

export interface AdminRunEventItem {
  severity: string;
  step: string | null;
  message: string;
  created_at: string;
}

export interface AdminBaselineFailureDetails {
  current_phase: string | null;
  detected_state: string | null;
  stuck_reason_code: string | null;
  stuck_reason_message: string | null;
  latest_error_code: string | null;
  latest_error_message: string | null;
  recommended_next_action: string | null;
}

export interface AdminBaselineLaunchRow {
  project_id: string;
  project_name: string;
  organization_name: string;
  domain: string;
  project_status: string;
  run_status: string;
  run_batch_id: string | null;
  created_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  display_timestamp: string | null;
  relaunch_allowed: boolean;
  failure_details: AdminBaselineFailureDetails;
  recent_events: AdminRunEventItem[];
}

export interface AdminDailyFailureDetails {
  workflow_status: string | null;
  current_step: string | null;
  failure_step: string | null;
  recovery_state: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  recovery_attempt_count: number | null;
  last_recovery_source: string | null;
  core_run_batch_id: string | null;
}

export interface AdminDailyLaunchRow {
  project_id: string;
  project_name: string;
  organization_name: string;
  domain: string;
  project_status: string;
  workflow_run_id: string | null;
  workflow_status: string;
  current_step: string | null;
  failure_step: string | null;
  recovery_state: string | null;
  created_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  display_timestamp: string | null;
  relaunch_allowed: boolean;
  failure_details: AdminDailyFailureDetails;
  recent_events: AdminRunEventItem[];
}

function sortByTimestampDescending<T extends { display_timestamp: string | null }>(rows: T[]): T[] {
  return [...rows].sort((left, right) => {
    const leftTimestamp = left.display_timestamp ?? "";
    const rightTimestamp = right.display_timestamp ?? "";
    return rightTimestamp.localeCompare(leftTimestamp);
  });
}

function readLatestBaselineRun(
  detail: ReconcilerAdminProjectDetail,
): ReconcilerAdminProjectDetail["diagnostics"]["baselineRuns"][number] | null {
  return (
    [...detail.diagnostics.baselineRuns].sort((left, right) => right.created_at.localeCompare(left.created_at))[0] ??
    null
  );
}

function mapReconcilerEvents(
  detail: ReconcilerAdminProjectDetail,
  limit: number,
): AdminRunEventItem[] {
  return detail.event_history.slice(0, limit).map((event) => ({
    severity: event.severity,
    step: event.step,
    message: event.message,
    created_at: event.created_at,
  }));
}

function mapDailyEvents(events: DailyRunnerWorkflowEvent[], limit: number): AdminRunEventItem[] {
  return events.slice(0, limit).map((event) => ({
    severity: event.severity,
    step: event.step,
    message: event.message,
    created_at: event.created_at,
  }));
}

function mapBaselineRow(
  item: ReconcilerAdminProjectListItem,
  detail: ReconcilerAdminProjectDetail,
): AdminBaselineLaunchRow {
  const latestRun = readLatestBaselineRun(detail);
  const reconciliationState = detail.reconciliation_state;
  const displayTimestamp =
    latestRun?.completed_at ??
    latestRun?.started_at ??
    latestRun?.created_at ??
    reconciliationState?.last_attempt_at ??
    item.last_reconciliation_attempt;

  return {
    project_id: item.project_id,
    project_name: item.project_name,
    organization_name: item.organization_name,
    domain: item.domain,
    project_status: item.project_status,
    run_status: latestRun?.status ?? "not_started",
    run_batch_id: latestRun?.id ?? null,
    created_at: latestRun?.created_at ?? null,
    started_at: latestRun?.started_at ?? null,
    completed_at: latestRun?.completed_at ?? null,
    display_timestamp: displayTimestamp,
    relaunch_allowed: item.project_status === "active",
    failure_details: {
      current_phase: reconciliationState?.current_phase ?? item.current_phase ?? null,
      detected_state: detail.detected_state ?? item.detected_state ?? null,
      stuck_reason_code: reconciliationState?.stuck_reason_code ?? item.stuck_reason_code ?? null,
      stuck_reason_message: reconciliationState?.stuck_reason_message ?? item.stuck_reason_message ?? null,
      latest_error_code: reconciliationState?.latest_error_code ?? item.latest_error_code ?? null,
      latest_error_message: reconciliationState?.latest_error_message ?? item.latest_error_message ?? null,
      recommended_next_action:
        reconciliationState?.recommended_next_action ?? detail.recommended_next_action ?? item.recommended_next_action,
    },
    recent_events: mapReconcilerEvents(detail, 10),
  };
}

function mapDailyRow(input: {
  project: ReconcilerAdminProjectListItem;
  workflow: DailyRunnerWorkflowRun | null;
  recentEvents: DailyRunnerWorkflowEvent[];
}): AdminDailyLaunchRow {
  const { project, workflow, recentEvents } = input;
  const displayTimestamp =
    workflow?.completed_at ??
    workflow?.started_at ??
    workflow?.created_at ??
    project.last_reconciliation_attempt;

  return {
    project_id: project.project_id,
    project_name: project.project_name,
    organization_name: project.organization_name,
    domain: project.domain,
    project_status: project.project_status,
    workflow_run_id: workflow?.id ?? null,
    workflow_status: workflow?.status ?? "not_started",
    current_step: workflow?.current_step ?? null,
    failure_step: workflow?.failure_step ?? null,
    recovery_state: workflow?.recovery_state ?? null,
    created_at: workflow?.created_at ?? null,
    started_at: workflow?.started_at ?? null,
    completed_at: workflow?.completed_at ?? null,
    display_timestamp: displayTimestamp,
    relaunch_allowed: project.project_status === "active",
    failure_details: {
      workflow_status: workflow?.status ?? null,
      current_step: workflow?.current_step ?? null,
      failure_step: workflow?.failure_step ?? null,
      recovery_state: workflow?.recovery_state ?? null,
      last_error_code: workflow?.last_error_code ?? null,
      last_error_message: workflow?.last_error_message ?? null,
      recovery_attempt_count: workflow?.recovery_attempt_count ?? null,
      last_recovery_source: workflow?.last_recovery_source ?? null,
      core_run_batch_id: workflow?.core_run_batch_id ?? null,
    },
    recent_events: mapDailyEvents(recentEvents, 10),
  };
}

export class AdminRunService {
  constructor(
    private readonly reconciler_client: ReconcilerClient,
    private readonly daily_runner_client: DailyRunnerClient,
  ) {}

  private assert_admin(user: AccessActor): void {
    const actor = resolve_access_actor(user);

    if (actor.role !== "admin") {
      throw new ForbiddenError("Admin access is required");
    }
  }

  async list_baseline_launches(user: AccessActor): Promise<{ runs: AdminBaselineLaunchRow[] }> {
    this.assert_admin(user);

    const response = await this.reconciler_client.list_projects();
    const baselineProjects = response.projects.filter((project) => !project.has_usable_baseline);
    const runs = await Promise.all(
      baselineProjects.map(async (project) => {
        const detail = await this.reconciler_client.get_project(project.project_id);
        return mapBaselineRow(project, detail);
      }),
    );

    return {
      runs: sortByTimestampDescending(runs),
    };
  }

  async list_daily_launches(user: AccessActor): Promise<{ runs: AdminDailyLaunchRow[] }> {
    this.assert_admin(user);

    const response = await this.reconciler_client.list_projects();
    const establishedProjects = response.projects.filter((project) => project.has_usable_baseline);
    const runs = await Promise.all(
      establishedProjects.map(async (project) => {
        const workflow = await this.daily_runner_client.get_latest_project_workflow(project.project_id);
        return mapDailyRow({
          project,
          workflow: workflow.workflow_run,
          recentEvents: workflow.recent_events,
        });
      }),
    );

    return {
      runs: sortByTimestampDescending(runs),
    };
  }

  async launch_daily(user: AccessActor, project_id: string): Promise<unknown> {
    this.assert_admin(user);
    return this.daily_runner_client.run_now(project_id);
  }
}
