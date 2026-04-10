import test from "node:test";
import assert from "node:assert/strict";

import { create_test_context } from "./helpers/test-context";

test("dashboard overview validates project access and delegates to Dashboard Layer", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1");
  const project = await context.seed_project("user-1", organization.id);

  context.clients.dashboard_layer_client.project_overview_response = {
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
    keyInsights: {
      strongestModel: null,
      weakestModel: null,
      weakestCluster: null,
      topCompetitor: null,
      visibilityTrendDirection: "unavailable",
    },
    healthFlags: [],
    previews: {
      models: [],
      clusters: [],
      competitors: [],
      recentRuns: [],
    },
  };

  const overview = await context.services.dashboard_service.get_project_overview("user-1", project.id);

  assert.equal(overview.project.id, project.id);
  assert.deepEqual(context.clients.dashboard_layer_client.last_overview_request, {
    user_id: "user-1",
    project_id: project.id,
  });
});

test("dashboard projects delegates portfolio filters to Dashboard Layer", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1");
  const project = await context.seed_project("user-1", organization.id);

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

  const projects = await context.services.dashboard_service.list_dashboard_projects("user-1", {
    organizationId: organization.id,
    status: "active",
  });

  assert.equal(projects.length, 1);
  assert.deepEqual(context.clients.dashboard_layer_client.last_portfolio_request, {
    user_id: "user-1",
    filters: {
      organizationId: organization.id,
      status: "active",
    },
  });
});

test("dashboard run results validate run-batch access before calling Dashboard Layer", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1");
  const project = await context.seed_project("user-1", organization.id);

  const run_batch = await context.clients.prompt_runner_client.create_run_batch(
    project.id,
    "baseline",
    ["prompt-1"],
    ["gpt-5.4"],
  );

  context.clients.dashboard_layer_client.run_results_response = {
    run: {
      runBatchId: run_batch.id,
      projectId: project.id,
      runType: "baseline",
      status: "completed",
      startedAt: run_batch.started_at,
      completedAt: run_batch.completed_at,
      totalExecutions: 1,
      completedExecutions: 1,
      failedExecutions: 0,
    },
    kpiSummary: {
      projectId: project.id,
      runBatchId: run_batch.id,
      mentionRate: 0.5,
      avgPosition: 1,
      shareOfVoice: 0.4,
      promptCoverage: 0.5,
      modelCoverage: {
        coverageRate: 1,
        totalModels: 1,
        modelsWithBrandMention: 1,
      },
      competitorPressure: 0.3,
      visibilityScore: 72,
      comparedToPrevious: null,
      hasData: true,
    },
    modelSummary: [],
    clusterSummary: [],
    competitorSummary: [],
  };

  const results = await context.services.dashboard_service.get_run_results("user-1", run_batch.id);

  assert.equal(results.run.runBatchId, run_batch.id);
  assert.deepEqual(context.clients.dashboard_layer_client.last_run_results_request, {
    user_id: "user-1",
    run_batch_id: run_batch.id,
  });
});
