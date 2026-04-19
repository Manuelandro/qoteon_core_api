import test from "node:test";
import assert from "node:assert/strict";

import { create_test_context } from "./helpers/test-context";

test("GET /projects/:project_id/visibility/summary proxies to Dashboard Layer filters", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1");
  const project = await context.seed_project("user-1", organization.id);
  const app = await context.build_app();

  context.clients.dashboard_layer_client.visibility_summary_response = {
    projectId: project.id,
    runBatchId: "run-1",
    mentionRate: 0.5,
    avgPosition: 1,
    shareOfVoice: 0.4,
    promptCoverage: 0.5,
    modelCoverage: {
      coverageRate: 1,
      totalModels: 2,
      modelsWithBrandMention: 2,
    },
    competitorPressure: 0.3,
    visibilityScore: 70,
    comparedToPrevious: null,
    hasData: true,
  };

  const response = await app.inject({
    method: "GET",
    url: `/projects/${project.id}/visibility/summary?run_batch_id=run-1&run_type=baseline`,
    headers: {
      "x-user-id": "user-1",
      "x-user-email": "user-1@example.com",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().projectId, project.id);
  assert.deepEqual(context.clients.dashboard_layer_client.last_visibility_request, {
    user_id: "user-1",
    project_id: project.id,
    filters: {
      runBatchId: "run-1",
      runType: "baseline",
      startDate: undefined,
      endDate: undefined,
    },
  });

  await app.close();
});

test("GET /dashboard/projects proxies portfolio cards from Dashboard Layer", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1");
  const project = await context.seed_project("user-1", organization.id);
  const app = await context.build_app();

  context.clients.dashboard_layer_client.portfolio_projects_response = [
    {
      project: {
        id: project.id,
        name: project.name,
        domain: project.domain,
        category: project.primary_category,
        language: project.target_language,
        region: project.target_region,
        status: project.status,
      },
      latestKpis: null,
      latestRun: null,
      healthFlags: [],
    },
  ];

  const response = await app.inject({
    method: "GET",
    url: `/dashboard/projects?organization_id=${organization.id}&status=active`,
    headers: {
      "x-user-id": "user-1",
      "x-user-email": "user-1@example.com",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().projects[0].project.id, project.id);
  assert.deepEqual(context.clients.dashboard_layer_client.last_portfolio_request, {
    user_id: "user-1",
    filters: {
      organizationId: organization.id,
      status: "active",
      limit: undefined,
    },
  });

  await app.close();
});

test("GET /projects/:project_id/visibility/prompts proxies prompt analysis rows", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1");
  const project = await context.seed_project("user-1", organization.id);
  const app = await context.build_app();

  context.clients.dashboard_layer_client.prompt_breakdown_response = {
    projectId: project.id,
    items: [
      {
        promptId: "prompt-1",
        promptText: "Best AI visibility tools for B2B SaaS teams",
        clusterName: "market_discovery",
        intentType: "commercial_discovery",
        sourceType: "seeded",
        isActive: true,
        totalCompletedExecutions: 2,
        executionsWithBrandMention: 1,
        visibilityPercent: 0.5,
        lastRunAt: "2026-04-14T08:00:00.000Z",
        lastRunBatchId: "run-1",
        lastRunType: "daily_tracking",
      },
    ],
    summary: {
      runBatchId: null,
      comparedRunBatchId: null,
      runType: null,
      observedAt: null,
      totalItems: 1,
      sortBy: "visibilityPercent",
      sortDirection: "desc",
    },
  };

  const response = await app.inject({
    method: "GET",
    url: `/projects/${project.id}/visibility/prompts?limit=25&sort_by=lastRunAt&sort_direction=asc`,
    headers: {
      "x-user-id": "user-1",
      "x-user-email": "user-1@example.com",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().items[0].promptId, "prompt-1");
  assert.deepEqual(context.clients.dashboard_layer_client.last_prompt_request, {
    user_id: "user-1",
    project_id: project.id,
    filters: {
      limit: 25,
      sortBy: "lastRunAt",
      sortDirection: "asc",
    },
  });

  await app.close();
});

test("GET /projects/:project_id/onboarding-progress maps crawl states to crawling_page", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1");
  const project = await context.seed_project("user-1", organization.id);
  const app = await context.build_app();

  context.clients.reconciler_client.detail_response = {
    ...context.clients.reconciler_client.detail_response,
    project: {
      ...context.clients.reconciler_client.detail_response.project,
      projectId: project.id,
      organizationId: organization.id,
    },
    reconciliation_state: {
      status: "auto_retrying",
      current_phase: "crawl",
      detected_state: "crawl_in_progress",
      stuck_reason_code: null,
      stuck_reason_message: "Crawl work is still in progress.",
      latest_error_code: null,
      latest_error_message: null,
      recommended_next_action: "Wait for the crawl to finish.",
      last_attempt_at: "2026-04-15T10:00:00.000Z",
      next_retry_at: "2026-04-15T10:00:03.000Z",
    },
    diagnostics: {
      baselineRuns: [],
      dashboardSummary: {
        hasData: false,
        runBatchId: null,
      },
    },
    detected_state: "crawl_in_progress",
  };

  const response = await app.inject({
    method: "GET",
    url: `/projects/${project.id}/onboarding-progress`,
    headers: {
      "x-user-id": "user-1",
      "x-user-email": "user-1@example.com",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().projectId, project.id);
  assert.equal(response.json().status, "crawling_page");
  assert.equal(response.json().progressPercent, 40);
  assert.equal(response.json().message, "Analyzing the page of your website");
  assert.equal(response.json().isTerminal, false);
  assert.equal(response.json().dashboardReady, false);
  assert.equal(response.json().backendStateCode, "crawl_in_progress");
  assert.equal(response.json().backendStateMessage, "Crawl work is still in progress.");
  assert.ok(response.json().pollAfterMs >= 1500);
  assert.ok(response.json().pollAfterMs <= 10000);

  await app.close();
});

test("GET /projects/:project_id/onboarding-progress maps prompt-generation states to generating_prompts", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1");
  const project = await context.seed_project("user-1", organization.id);
  const app = await context.build_app();

  context.clients.reconciler_client.detail_response = {
    ...context.clients.reconciler_client.detail_response,
    project: {
      ...context.clients.reconciler_client.detail_response.project,
      projectId: project.id,
      organizationId: organization.id,
    },
    reconciliation_state: {
      status: "recovering",
      current_phase: "prompt_generation",
      detected_state: "prompt_generation_failed_retryable",
      stuck_reason_code: "prompt_generation_failed_retryable",
      stuck_reason_message: "Prompt generation is retrying after a failed attempt.",
      latest_error_code: "upstream_timeout",
      latest_error_message: "Prompt Library timed out.",
      recommended_next_action: "Retry prompt generation.",
      last_attempt_at: "2026-04-15T10:00:00.000Z",
      next_retry_at: "2026-04-15T10:00:05.000Z",
    },
    diagnostics: {
      baselineRuns: [],
      dashboardSummary: {
        hasData: false,
        runBatchId: null,
      },
    },
    detected_state: "prompt_generation_failed_retryable",
  };

  const response = await app.inject({
    method: "GET",
    url: `/projects/${project.id}/onboarding-progress`,
    headers: {
      "x-user-id": "user-1",
      "x-user-email": "user-1@example.com",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, "generating_prompts");
  assert.equal(response.json().progressPercent, 65);
  assert.equal(response.json().message, "Retrieving the relevant prompts");
  assert.equal(response.json().dashboardReady, false);
  assert.equal(response.json().isTerminal, false);
  assert.equal(response.json().backendStateCode, "prompt_generation_failed_retryable");

  await app.close();
});

test("GET /projects/:project_id/onboarding-progress keeps crawl ahead of prompt generation while crawl work is still active", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1");
  const project = await context.seed_project("user-1", organization.id);
  const app = await context.build_app();

  context.clients.reconciler_client.detail_response = {
    ...context.clients.reconciler_client.detail_response,
    project: {
      ...context.clients.reconciler_client.detail_response.project,
      projectId: project.id,
      organizationId: organization.id,
    },
    reconciliation_state: {
      status: "auto_retrying",
      current_phase: "prompt_generation",
      detected_state: "prompt_generation_pending",
      stuck_reason_code: null,
      stuck_reason_message: "Prompt generation was requested and is waiting.",
      latest_error_code: null,
      latest_error_message: null,
      recommended_next_action: "Wait for Prompt Library to finish.",
      last_attempt_at: "2026-04-15T10:00:00.000Z",
      next_retry_at: "2026-04-15T10:00:03.000Z",
    },
    diagnostics: {
      baselineRuns: [],
      crawlRuns: [
        {
          id: "crawl-1",
          status: "running",
          created_at: "2026-04-15T10:00:00.000Z",
          started_at: "2026-04-15T10:00:30.000Z",
          completed_at: null,
        },
      ],
      promptContext: {
        client_website_crawl_status: "retrying",
      },
      prompts: [],
      dashboardSummary: {
        hasData: false,
        runBatchId: null,
      },
    },
    detected_state: "prompt_generation_pending",
  };

  const response = await app.inject({
    method: "GET",
    url: `/projects/${project.id}/onboarding-progress`,
    headers: {
      "x-user-id": "user-1",
      "x-user-email": "user-1@example.com",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, "crawling_page");
  assert.equal(response.json().progressPercent, 40);
  assert.equal(response.json().message, "Analyzing the page of your website");
  assert.equal(response.json().dashboardReady, false);

  await app.close();
});

test("GET /projects/:project_id/onboarding-progress maps baseline states to running_baseline", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1");
  const project = await context.seed_project("user-1", organization.id);
  const app = await context.build_app();

  context.clients.reconciler_client.detail_response = {
    ...context.clients.reconciler_client.detail_response,
    project: {
      ...context.clients.reconciler_client.detail_response.project,
      projectId: project.id,
      organizationId: organization.id,
    },
    reconciliation_state: {
      status: "auto_retrying",
      current_phase: "baseline",
      detected_state: "baseline_running",
      stuck_reason_code: null,
      stuck_reason_message: "The initial baseline is still running.",
      latest_error_code: null,
      latest_error_message: null,
      recommended_next_action: "Wait for progress.",
      last_attempt_at: "2026-04-15T10:00:00.000Z",
      next_retry_at: "2026-04-15T10:00:06.000Z",
    },
    diagnostics: {
      baselineRuns: [
        {
          id: "baseline-1",
          status: "running",
          created_at: "2026-04-15T09:59:00.000Z",
          started_at: "2026-04-15T10:00:00.000Z",
          completed_at: null,
        },
      ],
      dashboardSummary: {
        hasData: false,
        runBatchId: null,
      },
    },
    detected_state: "baseline_running",
  };

  const response = await app.inject({
    method: "GET",
    url: `/projects/${project.id}/onboarding-progress`,
    headers: {
      "x-user-id": "user-1",
      "x-user-email": "user-1@example.com",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, "running_baseline");
  assert.equal(response.json().progressPercent, 90);
  assert.equal(response.json().message, "Finalizing the data");
  assert.equal(response.json().dashboardReady, false);

  await app.close();
});

test("GET /projects/:project_id/onboarding-progress returns completed only when dashboard data is ready", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1");
  const project = await context.seed_project("user-1", organization.id);
  const app = await context.build_app();

  context.clients.reconciler_client.detail_response = {
    ...context.clients.reconciler_client.detail_response,
    project: {
      ...context.clients.reconciler_client.detail_response.project,
      projectId: project.id,
      organizationId: organization.id,
    },
    reconciliation_state: {
      status: "healthy",
      current_phase: "dashboard",
      detected_state: "dashboard_ready",
      stuck_reason_code: null,
      stuck_reason_message: null,
      latest_error_code: null,
      latest_error_message: null,
      recommended_next_action: "No action",
      last_attempt_at: "2026-04-15T10:00:00.000Z",
      next_retry_at: null,
    },
    diagnostics: {
      baselineRuns: [
        {
          id: "baseline-1",
          status: "completed",
          created_at: "2026-04-15T09:50:00.000Z",
          started_at: "2026-04-15T09:51:00.000Z",
          completed_at: "2026-04-15T09:59:00.000Z",
        },
      ],
      dashboardSummary: {
        hasData: true,
        runBatchId: "baseline-1",
      },
    },
    detected_state: "dashboard_ready",
  };

  const response = await app.inject({
    method: "GET",
    url: `/projects/${project.id}/onboarding-progress`,
    headers: {
      "x-user-id": "user-1",
      "x-user-email": "user-1@example.com",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    projectId: project.id,
    status: "completed",
    progressPercent: 100,
    message: "Dashboard ready",
    isTerminal: true,
    dashboardReady: true,
    pollAfterMs: 3000,
    backendStateCode: "dashboard_ready",
    backendStateMessage: null,
  });

  await app.close();
});

test("GET /projects/:project_id/onboarding-progress keeps the modal active while the latest baseline is only partial", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1");
  const project = await context.seed_project("user-1", organization.id);
  const app = await context.build_app();

  context.clients.reconciler_client.detail_response = {
    ...context.clients.reconciler_client.detail_response,
    project: {
      ...context.clients.reconciler_client.detail_response.project,
      projectId: project.id,
      organizationId: organization.id,
    },
    reconciliation_state: {
      status: "healthy",
      current_phase: "dashboard",
      detected_state: "dashboard_ready",
      stuck_reason_code: null,
      stuck_reason_message: null,
      latest_error_code: null,
      latest_error_message: null,
      recommended_next_action: "No action",
      last_attempt_at: "2026-04-15T10:00:00.000Z",
      next_retry_at: null,
    },
    diagnostics: {
      baselineRuns: [
        {
          id: "baseline-2",
          status: "partial",
          created_at: "2026-04-15T10:10:00.000Z",
          started_at: "2026-04-15T10:11:00.000Z",
          completed_at: "2026-04-15T10:19:00.000Z",
        },
        {
          id: "baseline-1",
          status: "completed",
          created_at: "2026-04-15T09:50:00.000Z",
          started_at: "2026-04-15T09:51:00.000Z",
          completed_at: "2026-04-15T09:59:00.000Z",
        },
      ],
      dashboardSummary: {
        hasData: true,
        runBatchId: "baseline-1",
      },
    },
    detected_state: "dashboard_ready",
  };

  const response = await app.inject({
    method: "GET",
    url: `/projects/${project.id}/onboarding-progress`,
    headers: {
      "x-user-id": "user-1",
      "x-user-email": "user-1@example.com",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, "running_baseline");
  assert.equal(response.json().progressPercent, 90);
  assert.equal(response.json().message, "Finalizing the data");
  assert.equal(response.json().dashboardReady, false);
  assert.equal(response.json().isTerminal, false);
  assert.equal(response.json().backendStateCode, "baseline_running");
  assert.equal(response.json().backendStateMessage, "The baseline run is still in progress.");

  await app.close();
});

test("GET /projects/:project_id/onboarding-progress trusts the baseline-specific dashboard probe when the latest run is ready", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1");
  const project = await context.seed_project("user-1", organization.id);
  const app = await context.build_app();

  context.clients.reconciler_client.detail_response = {
    ...context.clients.reconciler_client.detail_response,
    project: {
      ...context.clients.reconciler_client.detail_response.project,
      projectId: project.id,
      organizationId: organization.id,
    },
    reconciliation_state: {
      status: "healthy",
      current_phase: "dashboard",
      detected_state: "dashboard_ready",
      stuck_reason_code: null,
      stuck_reason_message: null,
      latest_error_code: null,
      latest_error_message: null,
      recommended_next_action: "No action",
      last_attempt_at: "2026-04-15T10:00:00.000Z",
      next_retry_at: null,
    },
    diagnostics: {
      baselineRuns: [
        {
          id: "baseline-2",
          status: "completed",
          created_at: "2026-04-15T10:10:00.000Z",
          started_at: "2026-04-15T10:11:00.000Z",
          completed_at: "2026-04-15T10:19:00.000Z",
        },
      ],
      latestBaselineProcessingState: {
        runBatchId: "baseline-2",
        isFullyProcessed: true,
      },
      latestBaselineDashboardState: {
        hasData: true,
        runBatchId: "baseline-2",
        probeSucceeded: true,
      },
      dashboardSummary: {
        hasData: false,
        runBatchId: null,
      },
    },
    detected_state: "dashboard_ready",
  };

  const response = await app.inject({
    method: "GET",
    url: `/projects/${project.id}/onboarding-progress`,
    headers: {
      "x-user-id": "user-1",
      "x-user-email": "user-1@example.com",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, "completed");
  assert.equal(response.json().dashboardReady, true);
  assert.equal(response.json().backendStateCode, "dashboard_ready");

  await app.close();
});

test("OPTIONS /projects/:project_id/onboarding-progress answers the browser CORS preflight", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1");
  const project = await context.seed_project("user-1", organization.id);
  const app = await context.build_app();

  const response = await app.inject({
    method: "OPTIONS",
    url: `/projects/${project.id}/onboarding-progress`,
    headers: {
      origin: "http://localhost:3000",
      "access-control-request-method": "GET",
      "access-control-request-headers": "authorization,x-user-id,x-user-email",
    },
  });

  assert.equal(response.statusCode, 204);
  assert.equal(response.headers["access-control-allow-origin"], "http://localhost:3000");
  assert.match(
    String(response.headers["access-control-allow-headers"] ?? ""),
    /authorization/i,
  );

  await app.close();
});
