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
  const isBlocked =
    detail.reconciliation_state?.status === "blocked_pending_admin" ||
    ((detail.detected_state ?? detail.reconciliation_state?.detected_state ?? null)?.endsWith(
      BLOCKED_STATE_SUFFIX,
    ) ?? false);
  const status = resolveUiStatus(detail, dashboardReady);
  const { code: backendStateCode, message: backendStateMessage } = resolveBackendState(detail, status, dashboardReady);

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

  if (shouldShowCrawlStage(detail, backendStateCode)) {
    return "crawling_page";
  }

  if (shouldShowPromptGenerationStage(detail, backendStateCode)) {
    return "generating_prompts";
  }

  return "running_baseline";
}

function resolveDashboardReady(detail: ReconcilerAdminProjectDetail) {
  const latestBaselineRun = getLatestRelevantBaselineRun(detail);
  const dashboardSummary = detail.diagnostics.dashboardSummary;
  const latestBaselineProcessingState = detail.diagnostics.latestBaselineProcessingState;
  const latestBaselineDashboardState = detail.diagnostics.latestBaselineDashboardState;

  if (!latestBaselineRun || latestBaselineRun.status !== "completed") {
    return false;
  }

  if (latestBaselineProcessingState && !latestBaselineProcessingState.isFullyProcessed) {
    return false;
  }

  if (
    latestBaselineDashboardState?.probeSucceeded &&
    latestBaselineDashboardState.hasData &&
    latestBaselineDashboardState.runBatchId === latestBaselineRun.id
  ) {
    return true;
  }

  if (!dashboardSummary?.hasData) {
    return false;
  }

  if (dashboardSummary.runBatchId && dashboardSummary.runBatchId !== latestBaselineRun.id) {
    return false;
  }

  return true;
}

function shouldShowCrawlStage(
  detail: ReconcilerAdminProjectDetail,
  backendStateCode: string | null,
) {
  const phase = detail.reconciliation_state?.current_phase ?? "baseline";
  const crawlStatus = detail.diagnostics.promptContext?.client_website_crawl_status ?? null;
  const hasActiveCrawl =
    detail.diagnostics.crawlRuns?.some(
      (run) => run.status === "queued" || run.status === "running",
    ) ?? false;

  return (
    crawlStatus === "pending" ||
    crawlStatus === "retrying" ||
    crawlStatus === "not_passed" ||
    hasActiveCrawl ||
    backendStateCode?.startsWith("crawl_") === true ||
    phase === "crawl" ||
    phase === "prompt_context"
  );
}

function shouldShowPromptGenerationStage(
  detail: ReconcilerAdminProjectDetail,
  backendStateCode: string | null,
) {
  const phase = detail.reconciliation_state?.current_phase ?? "baseline";
  const promptCount = detail.diagnostics.prompts?.length;

  if (typeof promptCount === "number") {
    return promptCount === 0;
  }

  return (
    backendStateCode?.startsWith("prompt_generation_") === true ||
    phase === "prompt_generation"
  );
}

function getLatestRelevantBaselineRun(detail: ReconcilerAdminProjectDetail) {
  const promptIds = detail.diagnostics.baselinePromptSet?.prompt_ids;
  const baselineRuns = detail.diagnostics.baselineRuns;

  const relevantRuns =
    promptIds && promptIds.length > 0
      ? baselineRuns.filter((run) => sameIdSet(run.prompt_ids ?? [], promptIds))
      : baselineRuns;

  return [...relevantRuns].sort((left, right) => right.created_at.localeCompare(left.created_at))[0] ?? null;
}

function sameIdSet(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  const leftIds = [...left].sort();
  const rightIds = [...right].sort();

  return leftIds.every((value, index) => value === rightIds[index]);
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

function resolveBackendState(
  detail: ReconcilerAdminProjectDetail,
  status: ProjectOnboardingUiStatus,
  dashboardReady: boolean,
) {
  const rawCode = detail.detected_state ?? detail.reconciliation_state?.detected_state ?? null;
  const rawMessage =
    detail.reconciliation_state?.stuck_reason_message ??
    detail.reconciliation_state?.latest_error_message ??
    null;

  if (dashboardReady) {
    return {
      code: rawCode,
      message: rawMessage,
    };
  }

  if (rawCode && rawCode !== "dashboard_ready" && rawCode !== "healthy") {
    return {
      code: rawCode,
      message: rawMessage,
    };
  }

  const fallbackCode = derivePendingBackendStateCode(detail, status);

  return {
    code: fallbackCode,
    message: rawMessage ?? derivePendingBackendStateMessage(fallbackCode),
  };
}

function derivePendingBackendStateCode(
  detail: ReconcilerAdminProjectDetail,
  status: ProjectOnboardingUiStatus,
) {
  if (status === "initializing") {
    return "project_created_no_crawl";
  }

  if (status === "crawling_page") {
    return "crawl_in_progress";
  }

  if (status === "generating_prompts") {
    return "prompt_generation_pending";
  }

  if (detail.diagnostics.latestBaselineProcessingState?.isFullyProcessed === false) {
    return "baseline_processing_pending";
  }

  if (
    detail.diagnostics.latestBaselineDashboardState &&
    (!detail.diagnostics.latestBaselineDashboardState.probeSucceeded ||
      !detail.diagnostics.latestBaselineDashboardState.hasData)
  ) {
    return "baseline_dashboard_pending";
  }

  return "baseline_running";
}

function derivePendingBackendStateMessage(code: string | null) {
  switch (code) {
    case "baseline_processing_pending":
      return "Baseline processing artifacts are still being generated.";
    case "baseline_dashboard_pending":
      return "Baseline processing is ready, but dashboard data is still materializing.";
    case "baseline_running":
      return "The baseline run is still in progress.";
    case "prompt_generation_pending":
      return "Prompt generation is still in progress.";
    case "crawl_in_progress":
      return "Website analysis is still in progress.";
    default:
      return null;
  }
}
