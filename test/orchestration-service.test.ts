import test from "node:test";
import assert from "node:assert/strict";

import { create_test_context } from "./helpers/test-context";

test("setup_project defers prompt generation until source intelligence is ready", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1");
  context.clients.prompt_library_client.fail_generate = new Error("prompt library down");

  const result = await context.services.orchestration_service.setup_project("user-1", {
    organization_id: organization.id,
    name: "Acme Project",
    domain: "acme.com",
    company_name: "Acme",
    primary_category: "SaaS",
    target_region: "US",
    target_language: "en",
    status: "active",
    competitors: [
      {
        competitor_name: "Competitor",
        competitor_domain: "competitor.example",
      },
    ],
    generate_initial_prompts: true,
    prompt_generation_payload: {
      personas: ["marketing lead"],
      use_cases: ["brand monitoring"],
    },
  });

  assert.equal(result.status, "success");
  assert.equal(result.project.name, "Acme Project");
  assert.equal(result.competitors.length, 1);
  assert.equal(result.prompt_generation.attempted, false);
  assert.equal(result.prompt_generation.succeeded, false);
  assert.equal(result.prompt_generation.result, null);
  assert.equal(result.warnings.length, 0);
  assert.equal(context.clients.source_intelligence_client.bootstrap_call_count, 1);
  assert.equal(context.clients.source_intelligence_client.create_crawl_runs_call_count, 1);
});

test("regenerate_project_prompts throws when source intelligence is not ready", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1");
  const project = await context.seed_project("user-1", organization.id);

  await assert.rejects(
    () =>
      context.services.orchestration_service.regenerate_project_prompts("user-1", project.id, {
        category: "SaaS",
      }),
    {
      name: "ConflictError",
      code: "conflict",
    },
  );
});

test("regenerate_project_prompts succeeds after source intelligence is ready", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1");
  const project = await context.seed_project("user-1", organization.id);
  context.clients.source_intelligence_client.prompt_context_by_project.set(project.id, {
    project_id: project.id,
    last_successful_crawl_at: "2026-04-10T12:00:00.000Z",
    is_ready_for_prompt_generation: true,
    prompt_generation_blockers: [],
    client_website_crawl_status: "passed",
    client_website_crawl_message: null,
    client_website_crawl_attempts_made: 1,
    client_website_crawl_max_attempts: 5,
    crawl_coverage: {
      active_target_count: 1,
      total_targets: 1,
      completed_run_count: 1,
      successful_target_count: 1,
      total_pages: 8,
      client_pages: 5,
      competitor_pages: 3,
      page_types: {},
    },
    suggested_personas: [],
    suggested_use_cases: [],
    suggested_features: [],
    suggested_integrations: [],
    suggested_industries: ["SaaS"],
    suggested_comparison_topics: [],
    suggested_faq_questions: [],
    competitor_signal_groups: [],
  });

  const result = await context.services.orchestration_service.regenerate_project_prompts("user-1", project.id, {
    category: "SaaS",
  });

  assert.ok(result.generated_count > 0);
});

test("launch_baseline_scan creates a run batch from the baseline prompt set", async () => {
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
    {
      id: "prompt-2",
      project_id: project.id,
      title: "Prompt 2",
      status: "ready",
      is_active: true,
      cluster: "comparison",
      intent: "consideration",
    },
  ]);
  context.seed_prompt_set(project.id, "baseline", ["prompt-1", "prompt-2"]);

  const result = await context.services.orchestration_service.launch_baseline_scan(
    "user-1",
    project.id,
    ["gpt-5.4", "claude-sonnet"],
    { source: "test" },
  );

  assert.equal(result.prompt_set.run_type, "baseline");
  assert.equal(result.prompt_set.prompt_count, 2);
  assert.equal(result.run_batch.run_type, "baseline");
  assert.equal(result.run_batch.execution_count, 4);
  assert.equal(
    result.run_batch.prompt_ids[0],
    context.clients.prompt_runner_client.synced_prompts.get("prompt-1"),
  );
});

test("launch_monthly_tracking creates a run batch from the monthly prompt set", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1");
  const project = await context.seed_project("user-1", organization.id);

  context.seed_prompts(project.id, [
    {
      id: "prompt-3",
      project_id: project.id,
      title: "Prompt 3",
      status: "ready",
      is_active: true,
      cluster: "brand",
      intent: "tracking",
    },
  ]);
  context.seed_prompt_set(project.id, "monthly_tracking", ["prompt-3"]);

  const result = await context.services.orchestration_service.launch_monthly_tracking(
    "user-1",
    project.id,
    ["gpt-5.4"],
  );

  assert.equal(result.prompt_set.run_type, "monthly_tracking");
  assert.equal(result.run_batch.run_type, "monthly_tracking");
  assert.equal(result.run_batch.execution_count, 1);
});

test("setup_project returns partial_success when source intelligence bootstrap fails", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1");
  context.clients.source_intelligence_client.fail_bootstrap = new Error("source intelligence down");

  const result = await context.services.orchestration_service.setup_project("user-1", {
    organization_id: organization.id,
    name: "Acme Project",
    domain: "acme.com",
    company_name: "Acme",
    primary_category: "SaaS",
    target_region: "US",
    target_language: "en",
    generate_initial_prompts: false,
  });

  assert.equal(result.status, "partial_success");
  assert.equal(result.warnings[0]?.service, "source_intelligence");
});
