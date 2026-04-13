import test from "node:test";
import assert from "node:assert/strict";

import { create_test_context } from "./helpers/test-context";

test("admin daily runner list route proxies to daily runner", async () => {
  const context = create_test_context();
  context.clients.daily_runner_client.list_response = {
    projects: [
      {
        project_id: "project-1",
        is_enabled: true,
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
      url: "/admin/daily-runner/projects",
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

test("admin daily runs route returns established projects with latest workflow diagnostics", async () => {
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
        reconciliation_status: "recovering",
        current_phase: "daily",
        detected_state: "daily_workflow_launch_failed",
        stuck_reason_code: "daily_workflow_launch_failed",
        stuck_reason_message: "Daily Runner failed the latest workflow at daily_run_launch_requested.",
        latest_error_code: "core_unavailable",
        latest_error_message: "Core unavailable",
        prompt_context_status: "passed",
        prompt_count: 24,
        latest_baseline_run_status: "completed",
        latest_baseline_progress: null,
        latest_daily_run_status: "failed",
        latest_daily_progress: null,
        latest_daily_parser_state: null,
        latest_daily_dashboard_state: null,
        has_usable_baseline: true,
        dashboard_ready: false,
        last_reconciliation_attempt: "2026-04-13T11:00:00.000Z",
        next_retry_at: null,
        recommended_next_action: "Retry the Daily Runner launch step through its recovery API.",
      },
    ],
  };
  context.clients.daily_runner_client.latest_workflow_response = {
    workflow_run: {
      id: "workflow-1",
      status: "failed",
      current_step: "failed",
      failure_step: "daily_run_launch_requested",
      recovery_state: "retryable",
      recovery_attempt_count: 1,
      last_recovery_source: "reconciler",
      last_error_code: "core_unavailable",
      last_error_message: "Core unavailable",
      core_run_batch_id: null,
      created_at: "2026-04-13T11:00:00.000Z",
      started_at: "2026-04-13T11:00:00.000Z",
      completed_at: "2026-04-13T11:03:00.000Z",
    },
    recent_events: [
      {
        severity: "error",
        step: "daily_run_launch_requested",
        message: "Core launch failed",
        created_at: "2026-04-13T11:03:00.000Z",
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
      url: "/admin/runs/daily",
      headers: {
        authorization: "Bearer test-token",
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().runs[0].workflow_status, "failed");
    assert.equal(response.json().runs[0].failure_details.failure_step, "daily_run_launch_requested");
    assert.equal(response.json().runs[0].recent_events[0].message, "Core launch failed");
    assert.deepEqual(context.clients.daily_runner_client.actions[0], {
      action: "get_latest_project_workflow",
      project_id: "project-1",
    });
  } finally {
    await app.close();
  }
});

test("admin daily runner routes reject non-admin users", async () => {
  const context = create_test_context();
  context.set_current_user({
    user_id: "owner-1",
    role: "owner",
  });
  const app = await context.build_app();

  try {
    const response = await app.inject({
      method: "POST",
      url: "/admin/daily-runner/projects/project-1/run-now",
      headers: {
        authorization: "Bearer test-token",
      },
    });

    assert.equal(response.statusCode, 403);
  } finally {
    await app.close();
  }
});

test("admin daily runner update schedule forwards payload", async () => {
  const context = create_test_context();
  context.set_current_user({
    user_id: "admin-1",
    role: "admin",
  });
  const app = await context.build_app();

  try {
    const response = await app.inject({
      method: "POST",
      url: "/admin/daily-runner/projects/project-1/update-schedule",
      headers: {
        authorization: "Bearer test-token",
      },
      payload: {
        timezone: "Europe/Rome",
        run_at_local_time: "08:30:00",
        is_enabled: true,
      },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(context.clients.daily_runner_client.actions[0], {
      action: "update_schedule",
      project_id: "project-1",
      payload: {
        timezone: "Europe/Rome",
        run_at_local_time: "08:30:00",
        is_enabled: true,
      },
    });
  } finally {
    await app.close();
  }
});

test("admin launch daily route forwards to daily runner run-now", async () => {
  const context = create_test_context();
  context.set_current_user({
    user_id: "admin-1",
    role: "admin",
  });
  const app = await context.build_app();

  try {
    const response = await app.inject({
      method: "POST",
      url: "/admin/projects/project-1/recovery/launch-daily",
      headers: {
        authorization: "Bearer test-token",
      },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(context.clients.daily_runner_client.actions[0], {
      action: "run_now",
      project_id: "project-1",
    });
  } finally {
    await app.close();
  }
});
