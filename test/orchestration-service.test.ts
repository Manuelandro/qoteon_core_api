import test from "node:test";
import assert from "node:assert/strict";

import { create_test_context } from "./helpers/test-context";

test("setup_project bootstraps crawl work and generates prompts immediately for active projects", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1");

  const result = await context.services.orchestration_service.setup_project("user-1", {
    organization_id: organization.id,
    name: "Acme Project",
    domain: "acme.com",
    company_name: "Acme",
    primary_category: "SaaS",
    target_region: ["United States"],
    target_language: "en",
    status: "active",
    competitors: [
      {
        competitor_name: "Competitor",
        competitor_domain: "competitor.example",
      },
    ],
  });

  assert.equal(result.status, "success");
  assert.equal(result.project.name, "Acme Project");
  assert.equal(result.competitors.length, 1);
  assert.equal(result.prompt_generation.attempted, true);
  assert.equal(result.prompt_generation.succeeded, true);
  assert.ok(result.prompt_generation.result?.generated_count);
  assert.equal(result.warnings.length, 0);
  assert.equal(context.clients.source_intelligence_client.bootstrap_call_count, 1);
  assert.equal(context.clients.source_intelligence_client.create_crawl_runs_call_count, 1);
});

test("setup_project does not bootstrap source intelligence for draft projects", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1");

  const result = await context.services.orchestration_service.setup_project("user-1", {
    organization_id: organization.id,
    name: "Draft Project",
    domain: "draft.example",
    company_name: "Draft Inc",
    primary_category: "SaaS",
    target_region: ["United States"],
    target_language: "en",
    status: "draft",
    generate_initial_prompts: false,
  });

  assert.equal(result.project.status, "draft");
  assert.equal(context.clients.source_intelligence_client.bootstrap_call_count, 0);
  assert.equal(context.clients.source_intelligence_client.create_crawl_runs_call_count, 0);
});

test("prefill_project_competitors does not bootstrap crawls for draft projects", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1");
  const project = await context.seed_project("user-1", organization.id, {
    status: "draft",
  });

  const result = await context.services.orchestration_service.prefill_project_competitors(
    "user-1",
    project.id,
  );

  assert.equal(result.source, "generated");
  assert.equal(result.competitors.length, 3);
  assert.equal(context.clients.source_intelligence_client.bootstrap_call_count, 0);
  assert.equal(context.clients.source_intelligence_client.create_crawl_runs_call_count, 0);
});

test("update_project bootstraps source intelligence when a draft project becomes active", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1");
  const project = await context.seed_project("user-1", organization.id, {
    status: "draft",
  });

  const updated = await context.services.orchestration_service.update_project(
    "user-1",
    project.id,
    {
      status: "active",
    },
  );

  assert.equal(updated.status, "active");
  assert.equal(context.clients.source_intelligence_client.bootstrap_call_count, 1);
  assert.equal(context.clients.source_intelligence_client.create_crawl_runs_call_count, 1);
});

test("regenerate_project_prompts no longer requires source intelligence readiness", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1");
  const project = await context.seed_project("user-1", organization.id);

  const result = await context.services.orchestration_service.regenerate_project_prompts("user-1", project.id, {});

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
  assert.equal(result.run_batch.prompt_ids[0], "prompt-1");
});

test("update_prompt proxies prompt text changes through Prompt Library", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1");
  const project = await context.seed_project("user-1", organization.id);

  context.seed_prompts(project.id, [
    {
      id: "prompt-1",
      project_id: project.id,
      title: "Prompt 1",
      body: "Original prompt",
      status: "ready",
      is_active: true,
      cluster: "brand",
      intent: "awareness",
    },
  ]);

  const prompt = await context.services.orchestration_service.update_prompt(
    "user-1",
    project.id,
    "prompt-1",
    "Updated prompt text",
  );

  assert.equal(prompt.body, "Updated prompt text");
});

test("delete_prompt archives the prompt through Prompt Library", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1");
  const project = await context.seed_project("user-1", organization.id);

  context.seed_prompts(project.id, [
    {
      id: "prompt-1",
      project_id: project.id,
      title: "Prompt 1",
      body: "Prompt body",
      status: "ready",
      is_active: true,
      cluster: "brand",
      intent: "awareness",
    },
  ]);

  const prompt = await context.services.orchestration_service.delete_prompt(
    "user-1",
    project.id,
    "prompt-1",
  );

  assert.equal(prompt.status, "archived");
  assert.equal(prompt.is_active, false);
  assert.ok(prompt.archived_at);
});

test("import_prompt_library_item is blocked when tracked prompt capacity is exhausted", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1", "trial");
  const project = await context.seed_project("user-1", organization.id);

  context.seed_prompts(
    project.id,
    Array.from({ length: 5 }, (_, index) => ({
      id: `prompt-${index + 1}`,
      project_id: project.id,
      title: `Prompt ${index + 1}`,
      body: `Prompt body ${index + 1}`,
      status: "ready" as const,
      is_active: true,
      cluster: "brand",
      intent: "awareness",
    })),
  );
  context.seed_prompt_library(project.id, [
    {
      id: "prompt-library-1",
      prompt_text: "Best AI visibility tools for enterprise teams",
      cluster_name: "market_discovery",
      intent_type: "commercial_discovery",
      language: "en",
      region: null,
      source_type: "llm_generated",
      is_active: true,
      metadata_json: {},
      imported_project_prompt_id: null,
      is_imported: false,
    },
  ]);

  await assert.rejects(
    () =>
      context.services.orchestration_service.import_prompt_library_item(
        "user-1",
        project.id,
        "prompt-library-1",
      ),
    {
      name: "ValidationError",
      message: "The trial plan supports up to 5 tracked prompts in the workspace.",
    },
  );
});

test("activate_prompt is blocked when tracked prompt capacity is exhausted", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1", "trial");
  const project = await context.seed_project("user-1", organization.id);

  context.seed_prompts(project.id, [
    {
      id: "prompt-1",
      project_id: project.id,
      title: "Prompt 1",
      body: "Prompt 1",
      status: "ready",
      is_active: true,
      cluster: "brand",
      intent: "awareness",
    },
    {
      id: "prompt-2",
      project_id: project.id,
      title: "Prompt 2",
      body: "Prompt 2",
      status: "ready",
      is_active: true,
      cluster: "brand",
      intent: "awareness",
    },
    {
      id: "prompt-3",
      project_id: project.id,
      title: "Prompt 3",
      body: "Prompt 3",
      status: "ready",
      is_active: true,
      cluster: "brand",
      intent: "awareness",
    },
    {
      id: "prompt-4",
      project_id: project.id,
      title: "Prompt 4",
      body: "Prompt 4",
      status: "ready",
      is_active: true,
      cluster: "brand",
      intent: "awareness",
    },
    {
      id: "prompt-5",
      project_id: project.id,
      title: "Prompt 5",
      body: "Prompt 5",
      status: "ready",
      is_active: false,
      cluster: "brand",
      intent: "awareness",
    },
    {
      id: "prompt-6",
      project_id: project.id,
      title: "Prompt 6",
      body: "Prompt 6",
      status: "ready",
      is_active: true,
      cluster: "brand",
      intent: "awareness",
    },
  ]);

  await assert.rejects(
    () =>
      context.services.orchestration_service.activate_prompt(
        "user-1",
        project.id,
        "prompt-5",
      ),
    {
      name: "ValidationError",
      message: "The trial plan supports up to 5 tracked prompts in the workspace.",
    },
  );
});

test("launch_daily_tracking creates a run batch from the daily prompt set", async () => {
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
  context.seed_prompt_set(project.id, "daily_tracking", ["prompt-3"]);

  const result = await context.services.orchestration_service.launch_daily_tracking(
    "user-1",
    project.id,
    ["gpt-5.4"],
  );

  assert.equal(result.prompt_set.run_type, "daily_tracking");
  assert.equal(result.run_batch.run_type, "daily_tracking");
  assert.equal(result.run_batch.execution_count, 1);
});

test("prepare_automatic_initial_baseline_run selects active models up to the plan limit", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1", "trial");
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
  context.seed_prompt_set(project.id, "baseline", ["prompt-1"]);

  const plan = await context.services.orchestration_service.prepare_automatic_initial_baseline_run(
    project.id,
  );

  assert.equal(plan.triggered, true);

  if (!plan.triggered) {
    throw new Error("Expected the automatic baseline plan to trigger");
  }

  assert.equal(plan.ai_model_ids.length, 3);
  assert.deepEqual(plan.ai_model_ids, ["gpt-5.4", "claude-sonnet", "gemini-2.5-pro"]);
  assert.equal(plan.prompt_count, 1);
  assert.equal(plan.metadata_json.trigger, "initial_baseline_after_onboarding");
});

test("prepare_automatic_initial_baseline_run skips when a baseline already exists", async () => {
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
  context.seed_prompt_set(project.id, "baseline", ["prompt-1"]);
  await context.services.orchestration_service.launch_baseline_scan("user-1", project.id, [
    "gpt-5.4",
  ]);

  const plan = await context.services.orchestration_service.prepare_automatic_initial_baseline_run(
    project.id,
  );

  assert.equal(plan.triggered, false);

  if (plan.triggered) {
    throw new Error("Expected the automatic baseline plan to be skipped");
  }

  assert.equal(plan.response.reason, "baseline_already_exists");
  assert.ok(plan.response.run_batch_id);
});

test("prepare_automatic_initial_baseline_run relaunches when the latest baseline used an outdated prompt set", async () => {
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
      intent: "comparison",
    },
  ]);
  context.seed_prompt_set(project.id, "baseline", ["prompt-1"]);
  await context.services.orchestration_service.launch_baseline_scan("user-1", project.id, [
    "gpt-5.4",
  ]);
  context.seed_prompt_set(project.id, "baseline", ["prompt-2"]);

  const plan = await context.services.orchestration_service.prepare_automatic_initial_baseline_run(
    project.id,
  );

  assert.equal(plan.triggered, true);

  if (!plan.triggered) {
    throw new Error("Expected the automatic baseline plan to trigger for an outdated baseline");
  }

  assert.equal(plan.prompt_count, 1);
});

test("prepare_automatic_initial_baseline_run returns a non-triggered result when no baseline prompts exist", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1", "trial");
  const project = await context.seed_project("user-1", organization.id);

  const plan = await context.services.orchestration_service.prepare_automatic_initial_baseline_run(
    project.id,
  );

  assert.equal(plan.triggered, false);

  if (plan.triggered) {
    throw new Error("Expected the automatic baseline plan not to trigger");
  }

  assert.equal(plan.response.reason, "no_prompts_available");
  assert.equal(plan.response.prompt_count, 0);
  assert.equal(plan.response.run_batch_id, null);
});

test("project creation is blocked when the organization reaches the domain limit", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1", "trial");

  await context.services.project_service.create_project("user-1", {
    organization_id: organization.id,
    name: "Project One",
    domain: "one.example",
    company_name: "One",
    primary_category: "SaaS",
    target_region: ["United States"],
    target_language: "en",
    status: "active",
  });

  await assert.rejects(
    () =>
      context.services.project_service.create_project("user-1", {
        organization_id: organization.id,
        name: "Project Two",
        domain: "two.example",
        company_name: "Two",
        primary_category: "SaaS",
        target_region: ["United States"],
        target_language: "en",
        status: "active",
      }),
    {
      name: "ValidationError",
      message: "The trial plan supports up to 1 domains.",
    },
  );
});

test("launch_baseline_scan rejects model counts above the plan limit", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1", "starter");
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
  context.seed_prompt_set(project.id, "baseline", ["prompt-1"]);

  await assert.rejects(
    () =>
      context.services.orchestration_service.launch_baseline_scan("user-1", project.id, [
        "gpt-5.4",
        "claude-sonnet",
        "gemini-2.5-pro",
        "grok-4",
      ]),
    {
      name: "ValidationError",
      message: "The starter plan supports up to 3 tracked models per run.",
    },
  );
});

test("launch_daily_tracking caps the selected prompt set to the daily tracked prompt limit", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1", "trial");
  const project = await context.seed_project("user-1", organization.id);

  const prompts = Array.from({ length: 10 }, (_, index) => ({
    id: `prompt-${index + 1}`,
    project_id: project.id,
    title: `Prompt ${index + 1}`,
    status: "ready" as const,
    is_active: true,
    cluster: `cluster-${index + 1}`,
    intent: "tracking",
  }));

  context.seed_prompts(project.id, prompts);
  context.seed_prompt_set(
    project.id,
    "daily_tracking",
    prompts.map((prompt) => prompt.id),
  );

  const result = await context.services.orchestration_service.launch_daily_tracking(
    "user-1",
    project.id,
    ["gpt-5.4"],
  );

  assert.equal(result.prompt_set.prompt_count, 5);
  assert.equal(result.run_batch.execution_count, 5);
});

test("llm response quota blocks later runs once the current period allowance is consumed", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1", "trial");
  const project = await context.seed_project("user-1", organization.id);
  const prompts = Array.from({ length: 450 }, (_, index) => ({
    id: `prompt-${index + 1}`,
    project_id: project.id,
    title: `Prompt ${index + 1}`,
    status: "ready" as const,
    is_active: true,
    cluster: `cluster-${index + 1}`,
    intent: "tracking",
  }));

  context.seed_prompts(project.id, prompts);
  context.seed_prompt_set(
    project.id,
    "baseline",
    prompts.map((prompt) => prompt.id),
  );

  await context.services.orchestration_service.launch_baseline_scan("user-1", project.id, [
    "gpt-5.4",
    "claude-sonnet",
    "gemini-2.5-pro",
  ]);

  await assert.rejects(
    () =>
      context.services.orchestration_service.launch_baseline_scan("user-1", project.id, [
        "gpt-5.4",
      ]),
    {
      name: "ConflictError",
      message: "Quota exceeded",
    },
  );
});

test("llm response reservations are released when run creation fails", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1", "trial");
  const project = await context.seed_project("user-1", organization.id);
  const prompts = Array.from({ length: 450 }, (_, index) => ({
    id: `prompt-${index + 1}`,
    project_id: project.id,
    title: `Prompt ${index + 1}`,
    status: "ready" as const,
    is_active: true,
    cluster: `cluster-${index + 1}`,
    intent: "tracking",
  }));

  context.seed_prompts(project.id, prompts);
  context.seed_prompt_set(
    project.id,
    "baseline",
    prompts.map((prompt) => prompt.id),
  );
  context.clients.prompt_runner_client.fail_create_run_batch = new Error("runner unavailable");

  await assert.rejects(
    () =>
      context.services.orchestration_service.launch_baseline_scan("user-1", project.id, [
        "gpt-5.4",
        "claude-sonnet",
        "gemini-2.5-pro",
      ]),
    /runner unavailable/,
  );

  context.clients.prompt_runner_client.fail_create_run_batch = null;

  const recovery = await context.services.orchestration_service.launch_baseline_scan(
    "user-1",
    project.id,
    ["gpt-5.4"],
  );

  assert.equal(recovery.run_batch.execution_count, 450);
});

test("concurrent run launches do not oversubscribe the response quota", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1", "trial");
  const project = await context.seed_project("user-1", organization.id);
  const prompts = Array.from({ length: 300 }, (_, index) => ({
    id: `prompt-${index + 1}`,
    project_id: project.id,
    title: `Prompt ${index + 1}`,
    status: "ready" as const,
    is_active: true,
    cluster: `cluster-${index + 1}`,
    intent: "tracking",
  }));

  context.seed_prompts(project.id, prompts);
  context.seed_prompt_set(
    project.id,
    "baseline",
    prompts.map((prompt) => prompt.id),
  );
  context.clients.prompt_runner_client.create_run_batch_delay_ms = 25;

  const results = await Promise.allSettled([
    context.services.orchestration_service.launch_baseline_scan("user-1", project.id, [
      "gpt-5.4",
      "claude-sonnet",
      "gemini-2.5-pro",
    ]),
    context.services.orchestration_service.launch_baseline_scan("user-1", project.id, [
      "gpt-5.4",
      "claude-sonnet",
      "gemini-2.5-pro",
    ]),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
});

test("expired trials block compute actions but still allow Core reads", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1", "trial", {
    trial_expires_at: "2026-04-01T00:00:00.000Z",
    billing_status: "expired",
  });

  const organizations = await context.services.organization_service.list_organizations_for_user("user-1");
  assert.equal(organizations.length, 1);

  await assert.rejects(
    () =>
      context.services.orchestration_service.setup_project("user-1", {
        organization_id: organization.id,
        name: "Expired Trial Project",
        domain: "expired.example",
        company_name: "Expired",
        primary_category: "SaaS",
        target_region: ["United States"],
        target_language: "en",
      }),
    {
      name: "ConflictError",
      message: "This organization can no longer run compute actions on the current plan.",
    },
  );
});

test("prefill_project_competitors generates competitors once and enqueues competitor crawls", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1");
  const project = await context.seed_project("user-1", organization.id, {
    domain: "acme.com",
    company_name: "Acme",
    target_region: ["Europe"],
    target_language: "English",
  });

  const result = await context.services.orchestration_service.prefill_project_competitors(
    "user-1",
    project.id,
  );

  assert.equal(result.source, "generated");
  assert.equal(result.competitors.length, 3);
  assert.equal(context.clients.source_intelligence_client.bootstrap_call_count, 1);
  assert.equal(context.clients.source_intelligence_client.create_crawl_runs_call_count, 1);
  assert.equal(
    context.clients.source_intelligence_client.crawl_runs_by_project.get(project.id)?.[0]?.trigger_type,
    "project_setup",
  );
  assert.equal(
    context.clients.prompt_runner_client.last_generate_competitor_suggestions_request?.company_name,
    "Acme",
  );
  assert.equal(
    context.clients.prompt_runner_client.last_generate_competitor_suggestions_request?.company_category,
    "SaaS",
  );
});

test("setup_project rejects competitor payloads beyond the starter plan cap", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1");

  await assert.rejects(
    () =>
      context.services.orchestration_service.setup_project("user-1", {
        organization_id: organization.id,
        name: "Acme Project",
        domain: "acme.com",
        company_name: "Acme",
        primary_category: "SaaS",
        target_region: ["United States"],
        target_language: "en",
        competitors: [
          {
            competitor_name: "Rival One",
            competitor_domain: "rival-one.example",
          },
          {
            competitor_name: "Rival Two",
            competitor_domain: "rival-two.example",
          },
          {
            competitor_name: "Rival Three",
            competitor_domain: "rival-three.example",
          },
          {
            competitor_name: "Rival Four",
            competitor_domain: "rival-four.example",
          },
        ],
      }),
    {
      name: "ValidationError",
      code: "validation_error",
      message: "The starter plan supports up to 3 competitors.",
    },
  );

  const projects = await context.services.project_service.list_projects("user-1", {
    organization_id: organization.id,
  });

  assert.equal(projects.length, 0);
});

test("prefill_project_competitors returns existing competitors without calling prompt runner again", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1");
  const project = await context.seed_project("user-1", organization.id);
  await context.services.project_service.create_competitor("user-1", project.id, {
    competitor_name: "Existing Rival",
    competitor_domain: "existing-rival.example",
  });

  const result = await context.services.orchestration_service.prefill_project_competitors(
    "user-1",
    project.id,
  );

  assert.equal(result.source, "existing");
  assert.equal(result.competitors.length, 1);
  assert.equal(
    context.clients.prompt_runner_client.last_generate_competitor_suggestions_request,
    null,
  );
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
    target_region: ["United States"],
    target_language: "en",
    status: "active",
    generate_initial_prompts: false,
  });

  assert.equal(result.status, "partial_success");
  assert.equal(result.warnings[0]?.service, "source_intelligence");
});
