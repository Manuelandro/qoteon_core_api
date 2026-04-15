# Qoteon Core API

`qoteon_core_api` is the authenticated control plane for Qoteon.

The frontend should talk to this service, not directly to the internal backend services.

## Current implementation status

Implemented:

- Supabase-backed user authentication
- Core-owned users, organizations, memberships, projects, and competitors
- plan catalog, trial state, retention settings, and usage counters
- project and competitor CRUD
- draft-to-active onboarding flow
- idempotent organization creation for duplicate onboarding requests that reuse the same slug for the same user
- competitor prefills through Prompt Runner during onboarding
- crawl orchestration through Source Intelligence
- prompt generation and prompt-state orchestration through Prompt Library
- prompt edit, archive, project-generated prompt-pool activation, and tracked-capacity summary through Prompt Library orchestration
- automatic prompt generation when a project becomes active, without waiting for crawl-derived prompt context
- baseline and `daily_tracking` launch orchestration through Prompt Runner
- dashboard proxy routes through Dashboard Layer
- Reconciler-backed `GET /projects/:project_id/onboarding-progress` mapping for the owner frontend onboarding-completion modal
- prompt-level visibility analytics proxied from Dashboard Layer
- admin proxy routes for Daily Runner and Reconciler
- Core-shaped admin launch list routes for baseline-oriented and established projects
- per-user and per-project concurrency guards on hot workflow routes
- idempotency support for run launch and crawl trigger flows
- route-aware admission control and backpressure for public write routes
- CORS allowlist handling for direct browser polling from the owner frontend
- non-fatal internal automation response when the initial baseline handoff arrives before any baseline prompts exist yet
- automatic initial baseline planning that ignores stale baseline batches when Prompt Library has already produced a newer baseline prompt set

Deferred:

- parser-summary reads proxied through Core

## What Core owns

- end-user authentication boundary
- organizations and organization membership
- projects and competitors
- plan entitlements and usage counters
- tracked prompt capacity guards on prompt import and activation
- public orchestration entry points
- admin access model

Core does not own:

- crawl tables
- prompt generation internals
- prompt execution rows
- parse artifacts
- dashboard materializations

## Auth and roles

### End-user auth

- Core verifies `Authorization: Bearer <supabase_access_token>`
- successful auth upserts the user into `public.core_users`

### Internal auth

- `/internal/*` routes require `Authorization: Bearer <INTERNAL_AUTH_TOKEN>`

### Runtime roles

- `owner`
  tenant-scoped through organization membership
- `admin`
  global project and organization access

## Main workflows

### Onboarding

1. create or reuse a draft organization and project
   Duplicate organization create attempts from the same onboarding session now resolve to the already-created organization instead of surfacing a slug conflict.
2. ask Prompt Runner for competitor suggestions
3. persist the selected competitors in Core
4. activate the project only after onboarding confirmation
5. once the project becomes `active`, bootstrap crawl work in Source Intelligence and request prompt generation from Prompt Library in parallel
6. the frontend should redirect immediately into the restricted dashboard and poll Core for onboarding completion while the same automatic pipeline continues in the background
7. Core should only report onboarding `completed` once dashboard data is actually renderable, using the Reconciler-backed dashboard-ready signal instead of a looser upstream run state

### Prompt and run orchestration

1. request prompt generation from Prompt Library
2. proxy prompt edit, archive, project-generated prompt-pool activation, and prompt-capacity summary
3. enforce active tracked-prompt capacity on prompt import and activation
4. request prompt-set selection from Prompt Library
5. sync prompts into Prompt Runner
6. enforce daily metered usage and concurrency guards before run launch
7. create the run batch in Prompt Runner
8. proxy progress and result reads back to the frontend

### Automation and recovery

Core also exposes private routes used by:

- `qoteon_daily_runner`
- `qoteon_reconciler`

This keeps quota enforcement and run-launch semantics centralized in Core.

For automatic initial baseline launches, Core now returns a non-triggered `200` result with reason `no_prompts_available` when Prompt Library has not produced any baseline prompts yet. That prevents downstream retry loops for a state that is not recoverable by retry alone.

Core also only treats an existing baseline as reusable when it matches the current Prompt Library baseline prompt set. If prompts were regenerated and the previous baseline batch is now stale, the next automatic or reconciler-driven baseline launch can create a fresh run from the current tracked baseline prompts instead of being blocked by the old batch row.

The admin launch pages are also shaped here:

- baseline launch rows are sourced from Reconciler-backed project health and detailed reconciliation reads
- daily launch rows are filtered using Reconciler baseline readiness and enriched with Daily Runner latest-workflow diagnostics
- the admin frontend still never talks to downstream services directly

## Route groups

All routes except `GET /health` require auth.

### Health

- `GET /health`

### Organizations

- `GET /organizations`
- `POST /organizations`

### Projects

- `POST /projects`
- `GET /projects`
- `GET /projects/:project_id`
- `PATCH /projects/:project_id`

### Competitors

- `POST /projects/:project_id/competitors`
- `POST /projects/:project_id/competitors/prefill`
- `POST /projects/:project_id/competitors/bootstrap`
- `GET /projects/:project_id/competitors`
- `PATCH /projects/:project_id/competitors/:competitor_id`
- `DELETE /projects/:project_id/competitors/:competitor_id`

### Prompt and workflow routes

- `POST /projects/:project_id/prompts/generate`
- `GET /projects/:project_id/prompts`
- `PATCH /projects/:project_id/prompts/:prompt_id`
- `DELETE /projects/:project_id/prompts/:prompt_id`
- `GET /projects/:project_id/prompt-sets/:run_type`
- `POST /projects/:project_id/prompts/:prompt_id/activate`
- `POST /projects/:project_id/prompts/:prompt_id/deactivate`
- `GET /projects/:project_id/prompt-library`
- `POST /projects/:project_id/prompt-library/:prompt_id/import`
- `GET /projects/:project_id/prompt-capacity`

### Run and crawl routes

- `POST /projects/:project_id/runs/baseline`
- `POST /projects/:project_id/runs/daily-tracking`
- `POST /projects/:project_id/runs/monthly-tracking`
- `POST /projects/:project_id/source-intelligence/crawl-runs`
- `GET /projects/:project_id/source-intelligence/crawl-runs`
- `GET /projects/:project_id/source-intelligence/prompt-context`
- `GET /projects/:project_id/run-batches`
- `GET /run-batches/:run_batch_id`
- `GET /run-batches/:run_batch_id/progress`
- `GET /run-batches/:run_batch_id/executions`
- `POST /run-batches/:run_batch_id/executions/:execution_id/retry`

### Dashboard proxy routes

- `GET /dashboard/projects`
- `GET /projects/:project_id/overview`
- `GET /projects/:project_id/onboarding-progress`
- `GET /projects/:project_id/visibility/summary`
- `GET /projects/:project_id/visibility/models`
- `GET /projects/:project_id/visibility/clusters`
- `GET /projects/:project_id/visibility/competitors`
- `GET /projects/:project_id/visibility/prompts`
- `GET /projects/:project_id/visibility/trends`
- `GET /run-batches/:run_batch_id/results`

### Onboarding progress contract

`GET /projects/:project_id/onboarding-progress` is the browser-polled contract used by `qoteon_frontend` after onboarding confirmation.

The response is shaped for UI consumption:

- `status`
  one of `initializing`, `crawling_page`, `generating_prompts`, `running_baseline`, `completed`
- `progressPercent`
  stable UI progress values of `15`, `40`, `65`, `90`, or `100`
- `message`
  the user-facing stage label used in the dashboard modal
- `dashboardReady`
  `true` only when Reconciler can confirm that dashboard data is renderable now
- `isTerminal`
  `true` for `completed` and for blocked states where the frontend should stop trapping the user behind the modal
- `backendStateCode` and `backendStateMessage`
  the current Reconciler-derived backend classification for debugging and concise fallback UI

Current mapping:

- `project_created_no_crawl` and phase `project` -> `initializing`
- `crawl_*` states and crawl or prompt-context phases -> `crawling_page`
- `prompt_generation_*` states and phase `prompt_generation` -> `generating_prompts`
- baseline, dashboard-materialization gap, `healthy`, and later daily-adjacent recovery states before `dashboardReady` -> `running_baseline`
- `completed` only when Reconciler reports dashboard-ready data, currently through `dashboardSummary.hasData`

## Prompt quota semantics

Core now enforces two related prompt limits:

- active tracked prompt capacity
  Checked when a generated project prompt is moved from the prompt library pool into tracking or reactivated for tracking. Deleting or deactivating a prompt frees this capacity immediately.
- daily tracked prompt usage
  Reserved when a `daily_tracking` run is launched. If run creation fails, the reservation is released.

For the current plan catalog, both numbers use the same product-facing cap:

- Trial: `5`
- Starter: `20`
- Growth: `50`
- Enterprise: `150`

### Admin routes

Reconciler proxy:

- `GET /admin/runs/baseline`
- `GET /admin/projects/reconciliation`
- `GET /admin/projects/:project_id/reconciliation`
- `POST /admin/projects/:project_id/reconciliation/run-now`
- `POST /admin/projects/:project_id/recovery/retry-crawl`
- `POST /admin/projects/:project_id/recovery/regenerate-prompts`
- `POST /admin/projects/:project_id/recovery/launch-baseline`
- `POST /admin/projects/:project_id/recovery/restart-initial-pipeline`

Daily Runner proxy:

- `GET /admin/runs/daily`
- `POST /admin/projects/:project_id/recovery/launch-daily`
- `GET /admin/daily-runner/projects`
- `GET /admin/daily-runner/projects/:project_id`
- `GET /admin/daily-runner/projects/:project_id/workflow-runs`
- `GET /admin/daily-runner/projects/:project_id/workflows/latest`
- `GET /admin/daily-runner/workflows/:workflow_run_id`
- `GET /admin/daily-runner/workflows/:workflow_run_id/events`
- `POST /admin/daily-runner/projects/:project_id/run-now`
- `POST /admin/daily-runner/projects/:project_id/pause`
- `POST /admin/daily-runner/projects/:project_id/resume`
- `POST /admin/daily-runner/projects/:project_id/update-schedule`
- `POST /admin/daily-runner/projects/:project_id/restart-workflow`
- `POST /admin/daily-runner/workflows/:workflow_run_id/retry-step`
- `POST /admin/daily-runner/workflows/:workflow_run_id/restart`

### Internal automation routes

- `POST /internal/projects/:project_id/runs/initial-baseline`
- `POST /internal/projects/:project_id/runs/baseline`
- `POST /internal/projects/:project_id/runs/daily-tracking`
- `POST /internal/projects/:project_id/daily-runner/crawl-refresh`
- `POST /internal/projects/:project_id/daily-runner/prompts/regenerate`
- `POST /internal/projects/:project_id/daily-runner/runs/daily-tracking`
- `GET /internal/daily-runner/run-batches/:run_batch_id/progress`

## Downstream dependencies

Core currently talks to:

- Source Intelligence
- Prompt Library
- Prompt Runner
- Dashboard Layer
- Daily Runner
- Reconciler

All of those integrations are implemented as client adapters under `src/clients`.

## Local run

```bash
npm install
npm run db:migrate
npm run build
npm run start
```

## Scripts

- `npm run build`
- `npm run db:migrate`
- `npm run start`
- `npm run test`

## Environment notes

Important variables:

- `DATABASE_URL`
- `DATABASE_SSL_MODE`
- `INTERNAL_AUTH_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` or the configured auth verification values
- downstream base URLs and auth tokens for Source Intelligence, Prompt Library, Prompt Runner, Dashboard Layer, Daily Runner, and Reconciler
- `CORE_CORS_ALLOWED_ORIGINS`

Notes:

- keep `DATABASE_SSL_MODE=disable` for local Postgres
- Core talks to downstream services over internal bearer tokens
- `CORE_CORS_ALLOWED_ORIGINS` is a comma-separated browser allowlist for direct frontend polling; keep local frontend origins here and add the deployed owner-frontend origin in production

See [`.env.example`](./.env.example) for the current local and production defaults.
