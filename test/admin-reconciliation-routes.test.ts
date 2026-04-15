import test from "node:test";
import assert from "node:assert/strict";

import { create_test_context } from "./helpers/test-context";

test("admin reconciliation list route proxies to reconciler", async () => {
  const context = create_test_context();
  context.clients.reconciler_client.list_response = {
    projects: [
      {
        project_id: "project-1",
        organization_id: "org-1",
        organization_name: "Acme",
        project_name: "Acme Project",
        domain: "acme.com",
        project_status: "active",
        reconciliation_status: "auto_retrying",
        current_phase: "baseline",
        detected_state: "baseline_running",
        stuck_reason_code: null,
        stuck_reason_message: null,
        latest_error_code: null,
        latest_error_message: null,
        prompt_context_status: "passed",
        prompt_count: 12,
        latest_baseline_run_status: "running",
        latest_baseline_progress: null,
        latest_daily_run_status: null,
        latest_daily_progress: null,
        latest_daily_parser_state: null,
        latest_daily_dashboard_state: null,
        has_usable_baseline: false,
        dashboard_ready: false,
        last_reconciliation_attempt: null,
        next_retry_at: null,
        recommended_next_action: "Watch the baseline progress.",
      },
    ],
  };
  context.set_current_user({
    user_id: "admin-1",
    role: "admin",
  });
  const app = await context.build_app();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/admin/projects/reconciliation",
      headers: {
        authorization: "Bearer test-token",
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().projects.length, 1);
  } finally {
    await app.close();
  }
});

test("admin baseline runs route returns baseline-oriented rows with reconciler details", async () => {
  const context = create_test_context();
  context.clients.reconciler_client.list_response = {
    projects: [
      {
        project_id: "project-1",
        organization_id: "org-1",
        organization_name: "Acme",
        project_name: "Acme Project",
        domain: "acme.com",
        project_status: "active",
        reconciliation_status: "blocked_pending_admin",
        current_phase: "prompt_generation",
        detected_state: "prompt_generation_blocked",
        stuck_reason_code: "prompt_generation_blocked",
        stuck_reason_message: "Project prompts are missing and should be regenerated through Prompt Library.",
        latest_error_code: "downstream_http_error",
        latest_error_message: "Prompt Library returned 503",
        prompt_context_status: "passed",
        prompt_count: 0,
        latest_baseline_run_status: null,
        latest_baseline_progress: null,
        latest_daily_run_status: null,
        latest_daily_progress: null,
        latest_daily_parser_state: null,
        latest_daily_dashboard_state: null,
        has_usable_baseline: false,
        dashboard_ready: false,
        last_reconciliation_attempt: "2026-04-13T10:00:00.000Z",
        next_retry_at: null,
        recommended_next_action: "Admin should regenerate prompts or restart the pipeline.",
      },
    ],
  };
  context.clients.reconciler_client.detail_response = {
    ...context.clients.reconciler_client.detail_response,
    reconciliation_state: {
      status: "blocked_pending_admin",
      current_phase: "prompt_generation",
      detected_state: "prompt_generation_blocked",
      stuck_reason_code: "prompt_generation_blocked",
      stuck_reason_message: "Project prompts are missing and should be regenerated through Prompt Library.",
      latest_error_code: "downstream_http_error",
      latest_error_message: "Prompt Library returned 503",
      recommended_next_action: "Admin should regenerate prompts or restart the pipeline.",
      last_attempt_at: "2026-04-13T10:00:00.000Z",
    },
    detected_state: "prompt_generation_blocked",
    recommended_next_action: "Admin should regenerate prompts or restart the pipeline.",
    event_history: [
      {
        severity: "error",
        step: "prompt_generation",
        message: "Prompt generation failed",
        created_at: "2026-04-13T10:00:00.000Z",
      },
    ],
  };
  context.set_current_user({
    user_id: "admin-1",
    role: "admin",
  });
  const app = await context.build_app();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/admin/runs/baseline",
      headers: {
        authorization: "Bearer test-token",
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().runs[0].run_status, "not_started");
    assert.equal(response.json().runs[0].failure_details.current_phase, "prompt_generation");
    assert.equal(response.json().runs[0].recent_events[0].message, "Prompt generation failed");
    assert.deepEqual(context.clients.reconciler_client.actions[0], {
      action: "get_project",
      project_id: "project-1",
    });
  } finally {
    await app.close();
  }
});

test("admin reconciliation routes reject non-admin users", async () => {
  const context = create_test_context();
  context.set_current_user({
    user_id: "owner-1",
    role: "owner",
  });
  const app = await context.build_app();

  try {
    const response = await app.inject({
      method: "POST",
      url: "/admin/projects/project-1/recovery/retry-crawl",
      headers: {
        authorization: "Bearer test-token",
      },
    });

    assert.equal(response.statusCode, 403);
  } finally {
    await app.close();
  }
});

test("admin restart route forwards force flag to reconciler", async () => {
  const context = create_test_context();
  context.set_current_user({
    user_id: "admin-1",
    role: "admin",
  });
  const app = await context.build_app();

  try {
    const response = await app.inject({
      method: "POST",
      url: "/admin/projects/project-1/recovery/restart-initial-pipeline",
      headers: {
        authorization: "Bearer test-token",
      },
      payload: {
        force: true,
      },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(context.clients.reconciler_client.actions[0], {
      action: "restart_initial_pipeline",
      project_id: "project-1",
      payload: { force: true },
    });
  } finally {
    await app.close();
  }
});
