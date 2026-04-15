import {
  ProjectOnboardingProgressResponse,
  ProjectOnboardingUiStatus,
} from "../domain/core";
import { ReconcilerAdminProjectDetail } from "../clients/reconciler-client";

const DEFAULT_POLL_AFTER_MS = 3_000;
const MAX_POLL_AFTER_MS = 10_000;
const MIN_POLL_AFTER_MS = 1_500;

const ONBOARDING_UI_PROGRESS: Record<ProjectOnboardingUiStatus, number> = {
  initializing: 15,
  crawling_page: 40,
  generating_prompts: 65,
  running_baseline: 90,
  completed: 100,
};

const ONBOARDING_UI_MESSAGES: Record<ProjectOnboardingUiStatus, string> = {
  initializing: "Setting up the project",
  crawling_page: "Analyzing the page of your website",
  generating_prompts: "Retrieving the relevant prompts",
  running_baseline: "Finalizing the data",
  completed: "Dashboard ready",
};

const BLOCKED_STATE_SUFFIX = "_blocked";

export function map_project_onboarding_progress(
  detail: ReconcilerAdminProjectDetail,
  now = new Date(),
): ProjectOnboardingProgressResponse {
  const dashboardReady = resolveDashboardReady(detail);
  const backendStateCode = detail.detected_state ?? detail.reconciliation_state?.detected_state ?? null;
  const backendStateMessage =
    detail.reconciliation_state?.stuck_reason_message ??
    detail.reconciliation_state?.latest_error_message ??
    null;
  const isBlocked =
    detail.reconciliation_state?.status === "blocked_pending_admin" ||
    (backendStateCode?.endsWith(BLOCKED_STATE_SUFFIX) ?? false);
  const status = resolveUiStatus(detail, dashboardReady);

  return {
    projectId: detail.project.projectId,
    status,
    progressPercent: ONBOARDING_UI_PROGRESS[status],
    message: ONBOARDING_UI_MESSAGES[status],
    isTerminal: dashboardReady || isBlocked,
    dashboardReady,
    pollAfterMs: resolvePollAfterMs(detail, now),
    backendStateCode,
    backendStateMessage,
  };
}

function resolveUiStatus(
  detail: ReconcilerAdminProjectDetail,
  dashboardReady: boolean,
): ProjectOnboardingUiStatus {
  if (dashboardReady) {
    return "completed";
  }

  const backendStateCode = detail.detected_state ?? detail.reconciliation_state?.detected_state ?? null;

  if (backendStateCode === "project_created_no_crawl" || detail.project.projectStatus !== "active") {
    return "initializing";
  }

  if (backendStateCode?.startsWith("crawl_")) {
    return "crawling_page";
  }

  if (backendStateCode?.startsWith("prompt_generation_")) {
    return "generating_prompts";
  }

  const phase = detail.reconciliation_state?.current_phase ?? "baseline";

  if (phase === "project") {
    return "initializing";
  }

  if (phase === "crawl" || phase === "prompt_context") {
    return "crawling_page";
  }

  if (phase === "prompt_generation") {
    return "generating_prompts";
  }

  return "running_baseline";
}

function resolveDashboardReady(detail: ReconcilerAdminProjectDetail) {
  return (
    detail.detected_state === "dashboard_ready" ||
    detail.diagnostics.dashboardSummary?.hasData === true
  );
}

function resolvePollAfterMs(detail: ReconcilerAdminProjectDetail, now: Date) {
  const nextRetryAt = detail.reconciliation_state?.next_retry_at;

  if (!nextRetryAt) {
    return DEFAULT_POLL_AFTER_MS;
  }

  const retryTimestamp = Date.parse(nextRetryAt);

  if (Number.isNaN(retryTimestamp)) {
    return DEFAULT_POLL_AFTER_MS;
  }

  return clamp(retryTimestamp - now.getTime(), MIN_POLL_AFTER_MS, MAX_POLL_AFTER_MS);
}

function clamp(value: number, min: number, max: number) {
  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}
