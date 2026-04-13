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
- competitor prefills through Prompt Runner during onboarding
- crawl orchestration through Source Intelligence
- prompt generation and prompt-state orchestration through Prompt Library
- baseline and `daily_tracking` launch orchestration through Prompt Runner
- dashboard proxy routes through Dashboard Layer
- admin proxy routes for Daily Runner and Reconciler
- Core-shaped admin launch list routes for baseline-oriented and established projects
- per-user and per-project concurrency guards on hot workflow routes
- idempotency support for run launch and crawl trigger flows
- route-aware admission control and backpressure for public write routes

Deferred:

- parser-summary reads proxied through Core

## What Core owns

- end-user authentication boundary
- organizations and organization membership
- projects and competitors
- plan entitlements and usage counters
- public orchestration entry points
- admin access model

Core does not own:

- crawl tables
- prompt templates
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
2. ask Prompt Runner for competitor suggestions
3. persist the selected competitors in Core
4. activate the project only after onboarding confirmation
5. bootstrap crawl work only after the project becomes `active`

### Prompt and run orchestration

1. request prompt generation from Prompt Library
2. request prompt-set selection from Prompt Library
3. sync prompts into Prompt Runner
4. enforce quotas and concurrency guards
5. create the run batch in Prompt Runner
6. proxy progress and result reads back to the frontend

### Automation and recovery

Core also exposes private routes used by:

- `qoteon_daily_runner`
- `qoteon_reconciler`

This keeps quota enforcement and run-launch semantics centralized in Core.

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
- `GET /projects/:project_id/prompt-sets/:run_type`
- `POST /projects/:project_id/prompts/:prompt_id/activate`
- `POST /projects/:project_id/prompts/:prompt_id/deactivate`

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
- `GET /projects/:project_id/visibility/summary`
- `GET /projects/:project_id/visibility/models`
- `GET /projects/:project_id/visibility/clusters`
- `GET /projects/:project_id/visibility/competitors`
- `GET /projects/:project_id/visibility/trends`
- `GET /run-batches/:run_batch_id/results`

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
- `GET /internal/projects/:project_id/daily-runner/prompt-context`
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
- `INTERNAL_AUTH_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` or the configured auth verification values
- downstream base URLs and auth tokens for Source Intelligence, Prompt Library, Prompt Runner, Dashboard Layer, Daily Runner, and Reconciler

See [`.env.example`](./.env.example) for the current local and production defaults.
