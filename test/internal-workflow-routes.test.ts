import test from "node:test";
import assert from "node:assert/strict";

import { create_test_context } from "./helpers/test-context";

test("internal initial baseline route launches automatically with internal auth", async () => {
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

  const app = await context.build_app();

  try {
    const response = await app.inject({
      method: "POST",
      url: `/internal/projects/${project.id}/runs/initial-baseline`,
      headers: {
        authorization: "Bearer qoteon-local-core-token",
      },
    });

    assert.equal(response.statusCode, 201);

    const payload = response.json();

    assert.equal(payload.project_id, project.id);
    assert.equal(payload.triggered, true);
    assert.equal(payload.reason, null);
    assert.equal(payload.ai_model_ids.length, 3);
    assert.equal(context.clients.prompt_runner_client.run_batches.size, 1);
  } finally {
    await app.close();
  }
});

test("internal initial baseline route rejects invalid internal auth", async () => {
  const context = create_test_context();
  const app = await context.build_app();

  try {
    const response = await app.inject({
      method: "POST",
      url: "/internal/projects/project-1/runs/initial-baseline",
      headers: {
        authorization: "Bearer wrong-token",
      },
    });

    assert.equal(response.statusCode, 401);
    assert.equal(response.json().error.code, "unauthorized");
  } finally {
    await app.close();
  }
});

test("internal initial baseline route returns a non-triggered response when no prompts are available", async () => {
  const context = create_test_context();
  const organization = await context.seed_organization("user-1", "trial");
  const project = await context.seed_project("user-1", organization.id);
  const app = await context.build_app();

  try {
    const response = await app.inject({
      method: "POST",
      url: `/internal/projects/${project.id}/runs/initial-baseline`,
      headers: {
        authorization: "Bearer qoteon-local-core-token",
      },
    });

    assert.equal(response.statusCode, 200);

    const payload = response.json();

    assert.equal(payload.project_id, project.id);
    assert.equal(payload.triggered, false);
    assert.equal(payload.reason, "no_prompts_available");
    assert.equal(payload.prompt_count, 0);
    assert.equal(context.clients.prompt_runner_client.run_batches.size, 0);
  } finally {
    await app.close();
  }
});

test("internal baseline launch route accepts explicit recovery launches", async () => {
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

  const app = await context.build_app();

  try {
    const response = await app.inject({
      method: "POST",
      url: `/internal/projects/${project.id}/runs/baseline`,
      headers: {
        authorization: "Bearer qoteon-local-core-token",
      },
      payload: {
        ai_model_ids: ["gpt-5.4"],
        metadata_json: {
          source: "reconciler",
          trigger: "recovery_baseline",
        },
        idempotency_key: "recovery-1",
      },
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.json().run_batch.project_id, project.id);
  } finally {
    await app.close();
  }
});

test("internal daily-tracking launch route accepts explicit reconciler recovery launches", async () => {
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
  context.seed_prompt_set(project.id, "daily_tracking", ["prompt-1"]);

  const app = await context.build_app();

  try {
    const response = await app.inject({
      method: "POST",
      url: `/internal/projects/${project.id}/runs/daily-tracking`,
      headers: {
        authorization: "Bearer qoteon-local-core-token",
      },
      payload: {
        ai_model_ids: ["gpt-5.4"],
        metadata_json: {
          source: "reconciler",
          trigger: "recovery_daily",
        },
        idempotency_key: "daily-recovery-1",
      },
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.json().run_batch.project_id, project.id);
    assert.equal(response.json().run_batch.run_type, "daily_tracking");
  } finally {
    await app.close();
  }
});

test("internal daily runner launch route launches daily tracking automatically", async () => {
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
  context.seed_prompt_set(project.id, "daily_tracking", ["prompt-1"]);

  const app = await context.build_app();

  try {
    const response = await app.inject({
      method: "POST",
      url: `/internal/projects/${project.id}/daily-runner/runs/daily-tracking`,
      headers: {
        authorization: "Bearer qoteon-local-core-token",
      },
      payload: {
        idempotency_key: "daily-runner:daily-run:project-1:2026-04-13",
        metadata_json: {
          source: "daily_runner",
        },
      },
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.json().triggered, true);
    assert.equal(context.clients.prompt_runner_client.run_batches.size, 1);
  } finally {
    await app.close();
  }
});
