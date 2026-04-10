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
