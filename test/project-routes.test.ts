import test from "node:test";
import assert from "node:assert/strict";

import { create_test_context } from "./helpers/test-context";

test("project creation route creates project, competitors, and defers prompt generation", async (t) => {
  const context = create_test_context();
  const app = await context.build_app();
  t.after(async () => {
    await app.close();
  });

  const organization_response = await app.inject({
    method: "POST",
    url: "/organizations",
    headers: {
      "x-user-id": "user-1",
      "x-user-email": "owner@example.com",
    },
    payload: {
      name: "Acme Org",
      plan_type: "starter",
    },
  });

  assert.equal(organization_response.statusCode, 201);
  const organization = organization_response.json();

  const response = await app.inject({
    method: "POST",
    url: "/projects",
    headers: {
      "x-user-id": "user-1",
      "x-user-email": "owner@example.com",
    },
    payload: {
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
          competitor_name: "Other Brand",
          competitor_domain: "other.example",
        },
      ],
      generate_initial_prompts: true,
      prompt_generation_payload: {
        personas: ["marketing lead"],
        use_cases: ["brand monitoring"],
      },
    },
  });

  assert.equal(response.statusCode, 201);
  const payload = response.json();
  assert.equal(payload.status, "success");
  assert.equal(payload.project.organization_id, organization.id);
  assert.equal(payload.competitors.length, 1);
  assert.equal(payload.prompt_generation.attempted, false);
  assert.equal(payload.prompt_generation.succeeded, false);
  assert.equal(payload.prompt_generation.result, null);
  assert.equal(context.clients.source_intelligence_client.bootstrap_call_count, 1);
  assert.equal(context.clients.source_intelligence_client.create_crawl_runs_call_count, 1);
});

test("competitor CRUD routes work end to end", async (t) => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1");
  const project = await context.seed_project("user-1", organization.id);
  const app = await context.build_app();
  t.after(async () => {
    await app.close();
  });

  const create_response = await app.inject({
    method: "POST",
    url: `/projects/${project.id}/competitors`,
    headers: {
      "x-user-id": "user-1",
    },
    payload: {
      competitor_name: "Rival",
      competitor_domain: "rival.example",
      notes: "Watch this one",
    },
  });

  assert.equal(create_response.statusCode, 201);
  const competitor = create_response.json();

  const list_response = await app.inject({
    method: "GET",
    url: `/projects/${project.id}/competitors`,
    headers: {
      "x-user-id": "user-1",
    },
  });

  assert.equal(list_response.statusCode, 200);
  assert.equal(list_response.json().competitors.length, 1);

  const update_response = await app.inject({
    method: "PATCH",
    url: `/projects/${project.id}/competitors/${competitor.id}`,
    headers: {
      "x-user-id": "user-1",
    },
    payload: {
      notes: "Updated note",
    },
  });

  assert.equal(update_response.statusCode, 200);
  assert.equal(update_response.json().notes, "Updated note");

  const delete_response = await app.inject({
    method: "DELETE",
    url: `/projects/${project.id}/competitors/${competitor.id}`,
    headers: {
      "x-user-id": "user-1",
    },
  });

  assert.equal(delete_response.statusCode, 204);

  const final_list_response = await app.inject({
    method: "GET",
    url: `/projects/${project.id}/competitors`,
    headers: {
      "x-user-id": "user-1",
    },
  });

  assert.equal(final_list_response.json().competitors.length, 0);
});

test("project access is denied when the user does not belong to the organization", async (t) => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1");
  const project = await context.seed_project("user-1", organization.id);
  const app = await context.build_app();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: `/projects/${project.id}`,
    headers: {
      "x-user-id": "user-2",
      "x-user-email": "outsider@example.com",
    },
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json().error.code, "forbidden");
});

test("source intelligence routes proxy manual crawl triggers and prompt-context reads", async (t) => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1");
  const project = await context.seed_project("user-1", organization.id);
  context.clients.source_intelligence_client.prompt_context_by_project.set(project.id, {
    project_id: project.id,
    last_successful_crawl_at: null,
    is_ready_for_prompt_generation: false,
    prompt_generation_blockers: ["no_successful_crawl", "no_successful_targets", "no_crawled_pages"],
    client_website_crawl_status: "pending",
    client_website_crawl_message: null,
    client_website_crawl_attempts_made: 0,
    client_website_crawl_max_attempts: 5,
    crawl_coverage: {
      active_target_count: 1,
      total_targets: 1,
      completed_run_count: 0,
      successful_target_count: 0,
      total_pages: 0,
      client_pages: 0,
      competitor_pages: 0,
      page_types: {},
    },
    suggested_personas: ["Marketing Teams"],
    suggested_use_cases: ["Brand Monitoring"],
    suggested_features: [],
    suggested_integrations: [],
    suggested_industries: [],
    suggested_comparison_topics: [],
    suggested_faq_questions: [],
    competitor_signal_groups: [],
  });
  const app = await context.build_app();
  t.after(async () => {
    await app.close();
  });

  const triggerResponse = await app.inject({
    method: "POST",
    url: `/projects/${project.id}/source-intelligence/crawl-runs`,
    headers: {
      "x-user-id": "user-1",
    },
    payload: {
      target_scope: "all",
      scope_type: "full",
      max_pages: 25,
    },
  });

  assert.equal(triggerResponse.statusCode, 201);
  assert.equal(triggerResponse.json().crawl_runs.length, 1);

  const promptContextResponse = await app.inject({
    method: "GET",
    url: `/projects/${project.id}/source-intelligence/prompt-context`,
    headers: {
      "x-user-id": "user-1",
    },
  });

  assert.equal(promptContextResponse.statusCode, 200);
  assert.equal(promptContextResponse.json().suggested_personas[0], "Marketing Teams");
});

test("prompt generation route returns conflict until source intelligence is ready", async (t) => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1");
  const project = await context.seed_project("user-1", organization.id);
  const app = await context.build_app();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: `/projects/${project.id}/prompts/generate`,
    headers: {
      "x-user-id": "user-1",
    },
    payload: {
      category: "SaaS",
    },
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error.code, "conflict");
});
