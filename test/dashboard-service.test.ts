import test from "node:test";
import assert from "node:assert/strict";

import { create_test_context } from "./helpers/test-context";

test("dashboard overview aggregates project, prompt summary, and latest run progress", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1");
  const project = await context.seed_project("user-1", organization.id);

  await context.services.project_service.create_competitor("user-1", project.id, {
    competitor_name: "Competitor",
    competitor_domain: "competitor.example",
  });

  context.seed_prompts(project.id, [
    {
      id: "prompt-1",
      project_id: project.id,
      title: "Prompt 1",
      status: "ready",
      is_active: true,
      cluster: "brand",
      intent: "awareness",
    },
    {
      id: "prompt-2",
      project_id: project.id,
      title: "Prompt 2",
      status: "ready",
      is_active: false,
      cluster: "comparison",
      intent: "consideration",
    },
  ]);

  const run_result = await context.clients.prompt_runner_client.create_run_batch(
    project.id,
    "baseline",
    ["prompt-1"],
    ["gpt-5.4"],
  );

  context.set_run_progress(run_result.id, {
    run_batch_id: run_result.id,
    status: "completed",
    total_executions: 1,
    queued_executions: 0,
    running_executions: 0,
    completed_executions: 1,
    failed_executions: 0,
    progress_percent: 100,
    updated_at: new Date().toISOString(),
  });

  const overview = await context.services.dashboard_service.get_project_overview("user-1", project.id);

  assert.equal(overview.project.id, project.id);
  assert.equal(overview.competitors.length, 1);
  assert.equal(overview.prompt_summary?.total_prompts, 2);
  assert.equal(overview.prompt_summary?.active_prompts, 1);
  assert.equal(overview.prompt_summary?.by_cluster.brand, 1);
  assert.equal(overview.latest_runs.length, 1);
  assert.equal(overview.latest_runs[0]?.progress?.progress_percent, 100);
  assert.equal(overview.warnings.length, 0);
});

test("dashboard overview returns partial data and warnings when Prompt Runner is unavailable", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1");
  const project = await context.seed_project("user-1", organization.id);

  context.seed_prompts(project.id, [
    {
      id: "prompt-1",
      project_id: project.id,
      title: "Prompt 1",
      status: "ready",
      is_active: true,
      cluster: "brand",
      intent: "awareness",
    },
  ]);
  context.clients.prompt_runner_client.fail_list_run_batches = new Error("runner down");

  const overview = await context.services.dashboard_service.get_project_overview("user-1", project.id);

  assert.equal(overview.project.id, project.id);
  assert.equal(overview.prompt_summary?.total_prompts, 1);
  assert.equal(overview.latest_runs.length, 0);
  assert.equal(overview.warnings.length, 1);
  assert.equal(overview.warnings[0]?.service, "prompt_runner");
  assert.ok(overview.health_flags.includes("partial_data"));
});
