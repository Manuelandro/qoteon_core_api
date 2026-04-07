import test from "node:test";
import assert from "node:assert/strict";

import { create_test_context } from "./helpers/test-context";

test("project creation route creates project, competitors, and prompt generation summary", async (t) => {
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
        prompt_count: 2,
        intents: ["awareness"],
      },
    },
  });

  assert.equal(response.statusCode, 201);
  const payload = response.json();
  assert.equal(payload.status, "success");
  assert.equal(payload.project.organization_id, organization.id);
  assert.equal(payload.competitors.length, 1);
  assert.equal(payload.prompt_generation.succeeded, true);
  assert.equal(payload.prompt_generation.result.generated_count, 2);
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
