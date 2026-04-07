import test from "node:test";
import assert from "node:assert/strict";

import { create_test_context } from "./helpers/test-context";

test("setup_project returns partial_success when prompt generation fails downstream", async () => {
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
      prompt_count: 2,
    },
  });

  assert.equal(result.status, "partial_success");
  assert.equal(result.project.name, "Acme Project");
  assert.equal(result.competitors.length, 1);
  assert.equal(result.prompt_generation.succeeded, false);
  assert.equal(result.warnings[0]?.service, "prompt_library");
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
