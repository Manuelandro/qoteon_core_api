# Qoteon Core API

Production-minded Core API / orchestration service for Qoteon.

## What it does

- Serves as the only backend the frontend should call
- Owns organizations, organization membership, projects, and competitors
- Orchestrates Source Intelligence, Prompt Library, and Prompt Runner through client interfaces
- Proxies Dashboard Layer portfolio, overview, KPI, trend, and run-result reads
- Keeps workflow logic in services instead of route handlers

## Current implementation status

- Implemented:
  - project and competitor CRUD
  - automatic post-crawl prompt generation owned by Prompt Library after Source Intelligence readiness notification, with manual regeneration still available through Core
  - crawl-target bootstrap and crawl-run orchestration through Source Intelligence
  - run launch orchestration through Prompt Runner
  - dashboard portfolio, overview, KPI, trend, and run-result proxy routes through Dashboard Layer
  - project-level source-intelligence status, persisted client crawl pass flags, prompt-context readiness, and prompt-context read routes
  - partial-success handling when downstream orchestration fails after project creation
- Deferred:
  - proxying parser summary reads through Core

## Stack

- Node.js
- TypeScript
- Fastify
- PostgreSQL via `pg` for all application data access
- Supabase Auth for bearer-token verification
- Zod
- Native `node:test`

## Local auth modes

- `AUTH_MODE=stub`
  - Default for local development and tests
  - Reads `x-user-id`, `x-user-email`, `x-user-name`, and `x-user-role`
- `AUTH_MODE=supabase`
  - Verifies Bearer tokens with Supabase Auth
  - Upserts the authenticated user into `public.core_users` through Postgres

## Downstream service assumptions

The Core API currently ships with HTTP adapters for:

- Source Intelligence
- Prompt Library
- Prompt Runner
- Dashboard Layer

Prompt Runner now supports both `PROVIDER_EXECUTION_MODE=stub` and
`PROVIDER_EXECUTION_MODE=live`. Core does not manage provider credentials
itself; the live provider keys must be configured on the Prompt Runner API and
worker services.

Default Render internal service base URLs:

- Source Intelligence: `http://qoteon-source-intelligence-api:3000`
- Prompt Library: `http://qoteon-prompt-library:3000`
- Prompt Runner: `http://qoteon-prompt-runner-api:3000`
- Dashboard Layer: `http://qoteon-dashboard-layer:4020`

Those are the defaults used by the app when `SOURCE_INTELLIGENCE_BASE_URL`, `PROMPT_LIBRARY_BASE_URL`, `PROMPT_RUNNER_BASE_URL`, and `DASHBOARD_LAYER_BASE_URL` are not explicitly set.

This codebase assumes all four downstreams expose HTTP APIs on Render private-network hosts.

Default internal paths assumed by the adapters:

- Source Intelligence
  - `POST /internal/projects/:project_id/crawl-targets/bootstrap`
  - `POST /internal/projects/:project_id/crawl-runs`
  - `GET /internal/projects/:project_id/crawl-runs`
  - `GET /internal/projects/:project_id/prompt-context`
- Prompt Library
  - `POST /internal/projects/:project_id/prompts/generate`
  - `GET /internal/projects/:project_id/prompts`
  - `GET /internal/projects/:project_id/prompt-sets/:run_type`
  - `POST /internal/projects/:project_id/prompts/:prompt_id/activate`
  - `POST /internal/projects/:project_id/prompts/:prompt_id/deactivate`
- Prompt Runner
  - `POST /internal/projects/:project_id/run-batches`
  - `GET /internal/projects/:project_id/run-batches`
  - `GET /internal/run-batches/:run_batch_id`
  - `GET /internal/run-batches/:run_batch_id/progress`
  - `GET /internal/run-batches/:run_batch_id/executions`
  - `POST /internal/executions/:execution_id/retry`
- Dashboard Layer
  - `GET /portfolio/projects`
  - `GET /projects/:project_id/overview`
  - `GET /projects/:project_id/visibility/summary`
  - `GET /projects/:project_id/visibility/models`
  - `GET /projects/:project_id/visibility/clusters`
  - `GET /projects/:project_id/visibility/competitors`
  - `GET /projects/:project_id/visibility/trends`
  - `GET /runs/:run_batch_id/results`

If your Render services expose different paths behind those internal hosts, update the HTTP clients without changing the route or orchestration layers.

## Render deployment notes

- Deploy the Core API, Source Intelligence, Prompt Library, Prompt Runner API, and Dashboard Layer into the same Render private network.
- The Core API expects to reach Source Intelligence at `qoteon-source-intelligence-api:3000`.
- The Core API expects to reach Prompt Library at `qoteon-prompt-library:3000`.
- The Core API expects to reach Prompt Runner API at `qoteon-prompt-runner-api:3000`.
- The Core API expects to reach Dashboard Layer at `qoteon-dashboard-layer:4020`.
- Set `DASHBOARD_LAYER_AUTH_TOKEN` in Core and `INTERNAL_AUTH_TOKEN` in Dashboard Layer to the same private value.
- Core forwards `x-qoteon-user-id` to Dashboard Layer so the dashboard service can re-check tenant access.
- Override `SOURCE_INTELLIGENCE_BASE_URL`, `PROMPT_LIBRARY_BASE_URL`, `PROMPT_RUNNER_BASE_URL`, or `DASHBOARD_LAYER_BASE_URL` only if you intentionally change those internal service names or ports.

## API routes

All routes except `GET /health` require authentication.

Database access for all local Core API tables is done through PostgreSQL using `DATABASE_URL`. Supabase client usage is limited to auth token verification when `AUTH_MODE=supabase`.

- In `AUTH_MODE=stub`, pass:
  - `x-user-id`
  - `x-user-email`
  - Optional: `x-user-name`
  - Optional: `x-user-role`
- In `AUTH_MODE=supabase`, pass:
  - `Authorization: Bearer <supabase_access_token>`

### Health

#### `GET /health`

- Payload: none
- What it does: returns a simple liveness payload for the Core API process.

### Organizations

#### `GET /organizations`

- Payload: none
- What it does: lists organizations the current user belongs to.

#### `POST /organizations`

- Payload:

```json
{
  "name": "Acme",
  "slug": "acme",
  "plan_type": "starter"
}
```

- Notes:
  - `slug` is optional.
  - `plan_type` is optional and defaults to `starter`.
- What it does: creates an organization and adds the current user as an `owner`.

### Projects

#### `POST /projects`

- Payload:

```json
{
  "organization_id": "org_123",
  "name": "Acme Project",
  "domain": "acme.com",
  "company_name": "Acme",
  "primary_category": "SaaS",
  "target_region": "US",
  "target_language": "en",
  "status": "active",
  "competitors": [
    {
      "competitor_name": "Other Brand",
      "competitor_domain": "otherbrand.com",
      "notes": "Optional note"
    }
  ],
  "generate_initial_prompts": false
}
```

- Notes:
  - `status` is optional.
  - `competitors` is optional.
  - `generate_initial_prompts` defaults to `false`.
  - `generate_initial_prompts` is accepted for backward compatibility, but project creation no longer generates prompts inline and the flag is ignored.
- What it does:
  - Validates organization access.
  - Creates the project.
  - Creates competitors if provided.
  - Bootstraps Source Intelligence crawl targets and enqueues initial crawl runs asynchronously.
  - Returns immediately while Source Intelligence crawls the client and competitor sites.
  - Relies on Prompt Library to generate the initial prompt set automatically once Source Intelligence has produced ready crawl context.
  - Leaves `POST /projects/:project_id/prompts/generate` available as an explicit regeneration route after readiness.
  - Returns `success` or `partial_success` if any downstream orchestration fails after project creation.

#### `GET /projects`

- Query params:

```json
{
  "organization_id": "org_123",
  "status": "active"
}
```

- Notes:
  - Both query params are optional.
- What it does: lists projects visible to the current user, optionally filtered by organization and project status.

#### `GET /projects/:project_id`

- Path params:

```json
{
  "project_id": "project_123"
}
```

- Payload: none
- What it does: returns one project after validating project access.

#### `PATCH /projects/:project_id`

- Path params:

```json
{
  "project_id": "project_123"
}
```

- Payload:

```json
{
  "name": "Updated Project Name",
  "domain": "new-domain.com",
  "company_name": "Acme Inc",
  "primary_category": "AI Software",
  "target_region": "EU",
  "target_language": "en",
  "status": "paused"
}
```

- Notes:
  - Provide at least one field.
  - Every field is optional.
- What it does: updates project metadata after validating project access.

### Competitors

#### `POST /projects/:project_id/competitors`

- Path params:

```json
{
  "project_id": "project_123"
}
```

- Payload:

```json
{
  "competitor_name": "Competitor",
  "competitor_domain": "competitor.com",
  "notes": "Optional note"
}
```

- What it does: creates a competitor row for the project.

#### `GET /projects/:project_id/competitors`

- Path params:

```json
{
  "project_id": "project_123"
}
```

- Payload: none
- What it does: lists competitors for the project.

#### `PATCH /projects/:project_id/competitors/:competitor_id`

- Path params:

```json
{
  "project_id": "project_123",
  "competitor_id": "competitor_123"
}
```

- Payload:

```json
{
  "competitor_name": "Updated Competitor",
  "competitor_domain": "updated-competitor.com",
  "notes": "Updated note"
}
```

- Notes:
  - Provide at least one field.
  - Every field is optional.
- What it does: updates one competitor for the project.

#### `DELETE /projects/:project_id/competitors/:competitor_id`

- Path params:

```json
{
  "project_id": "project_123",
  "competitor_id": "competitor_123"
}
```

- Payload: none
- What it does: deletes one competitor from the project.

### Prompt workflows

#### `POST /projects/:project_id/prompts/generate`

- Path params:

```json
{
  "project_id": "project_123"
}
```

- Payload:

```json
{
  "personas": ["brand marketers", "SEO leads"],
  "use_cases": ["monitoring brand mentions in AI answers"],
  "metadata_json": {
    "source": "manual_regeneration"
  }
}
```

- What it does: validates project access, checks that Source Intelligence is ready for prompt generation, and then asks Prompt Library to regenerate prompts for the project.
- Notes:
  - Initial prompt generation is normally automatic once Source Intelligence becomes ready.
  - This route exists for explicit regeneration after a later crawl or data refresh.
- If Source Intelligence is not ready yet, this route returns `409 conflict`.

#### `GET /projects/:project_id/prompts`

- Path params:

```json
{
  "project_id": "project_123"
}
```

- Query params:

```json
{
  "status": "ready",
  "is_active": "true"
}
```

- Notes:
  - Both query params are optional.
  - `is_active` must be `"true"` or `"false"` when present.
- What it does: returns project prompts from Prompt Library, optionally filtered by status and active flag.

#### `GET /projects/:project_id/prompt-sets/:run_type`

- Path params:

```json
{
  "project_id": "project_123",
  "run_type": "baseline"
}
```

- Notes:
  - `run_type` must be `baseline` or `monthly_tracking`.
- What it does: returns a lightweight prompt set summary for the requested run type.

#### `POST /projects/:project_id/prompts/:prompt_id/activate`

- Path params:

```json
{
  "project_id": "project_123",
  "prompt_id": "prompt_123"
}
```

- Payload: none
- What it does: marks one prompt as active in Prompt Library.

#### `POST /projects/:project_id/prompts/:prompt_id/deactivate`

- Path params:

```json
{
  "project_id": "project_123",
  "prompt_id": "prompt_123"
}
```

- Payload: none
- What it does: marks one prompt as inactive in Prompt Library.

### Source intelligence workflows

#### `POST /projects/:project_id/source-intelligence/crawl-runs`

- Path params:

```json
{
  "project_id": "project_123"
}
```

- Payload:

```json
{
  "target_scope": "all",
  "scope_type": "full",
  "max_pages": 50,
  "max_depth": 3
}
```

- Notes:
  - `target_scope` may be `client`, `competitors`, or `all`.
  - `scope_type` may be `full`, `incremental`, or `single_url`.
  - `competitor_ids` and `single_url` are optional advanced filters.
- What it does: validates project access and asks Source Intelligence to enqueue crawl runs for the project. Use this route when prompt context reports `client_website_crawl_status=not_passed` and you want to retry the client crawl later.

#### `GET /projects/:project_id/source-intelligence/crawl-runs`

- Path params:

```json
{
  "project_id": "project_123"
}
```

- Query params:

```json
{
  "status": "completed",
  "limit": 10
}
```

- Notes:
  - Both query params are optional.
- What it does: returns crawl runs for the project through the Source Intelligence client.

#### `GET /projects/:project_id/source-intelligence/prompt-context`

- Path params:

```json
{
  "project_id": "project_123"
}
```

- Payload: none
- What it does: returns the latest crawl-derived prompt-context payload for the project, including `is_ready_for_prompt_generation`, `prompt_generation_blockers`, `client_website_crawl_status`, `client_website_crawl_message`, `client_website_crawl_attempts_made`, and `client_website_crawl_max_attempts`.

### Run workflows

#### `POST /projects/:project_id/runs/baseline`

- Path params:

```json
{
  "project_id": "project_123"
}
```

- Payload:

```json
{
  "ai_model_ids": ["gpt-5.4", "claude-sonnet"],
  "metadata_json": {
    "source": "manual_launch"
  }
}
```

- Notes:
  - `ai_model_ids` is required and must contain at least one model id.
  - `metadata_json` is optional.
- What it does:
  - Validates project access.
  - Fetches the `baseline` prompt set from Prompt Library.
  - Creates a run batch in Prompt Runner.
  - Returns prompt set info plus the created run batch.

#### `POST /projects/:project_id/runs/monthly-tracking`

- Path params:

```json
{
  "project_id": "project_123"
}
```

- Payload:

```json
{
  "ai_model_ids": ["gpt-5.4"],
  "metadata_json": {
    "source": "monthly_cycle"
  }
}
```

- Notes:
  - `ai_model_ids` is required and must contain at least one model id.
  - `metadata_json` is optional.
- What it does:
  - Validates project access.
  - Fetches the `monthly_tracking` prompt set from Prompt Library.
  - Creates a run batch in Prompt Runner.
  - Returns prompt set info plus the created run batch.

#### `GET /projects/:project_id/run-batches`

- Path params:

```json
{
  "project_id": "project_123"
}
```

- Query params:

```json
{
  "status": "queued",
  "run_type": "baseline",
  "start_date": "2026-04-01",
  "end_date": "2026-04-30",
  "limit": 10
}
```

- Notes:
  - All query params are optional.
  - `run_type` must be `baseline` or `monthly_tracking` when present.
- What it does: lists run batches for the project, filtered by status, run type, and date range when supplied.

#### `GET /run-batches/:run_batch_id`

- Path params:

```json
{
  "run_batch_id": "run_batch_123"
}
```

- Payload: none
- What it does: loads one run batch from Prompt Runner and validates the current user can access the owning project.

#### `GET /run-batches/:run_batch_id/progress`

- Path params:

```json
{
  "run_batch_id": "run_batch_123"
}
```

- Payload: none
- What it does: returns progress counters for the run batch after validating access.

#### `GET /run-batches/:run_batch_id/executions`

- Path params:

```json
{
  "run_batch_id": "run_batch_123"
}
```

- Query params:

```json
{
  "status": "failed"
}
```

- Notes:
  - `status` is optional.
- What it does: lists executions for a run batch, optionally filtered by execution status.

#### `POST /run-batches/:run_batch_id/executions/:execution_id/retry`

- Path params:

```json
{
  "run_batch_id": "run_batch_123",
  "execution_id": "execution_123"
}
```

- Payload: none
- What it does: retries one execution in Prompt Runner after validating access to the parent run batch.

### Overview and dashboard

#### `GET /projects/:project_id/overview`

- Path params:

```json
{
  "project_id": "project_123"
}
```

- Payload: none
- What it does:
  - Validates project access in Core.
  - Forwards the request to Dashboard Layer with the authenticated user ID.
  - Returns the dashboard overview payload after Dashboard Layer re-checks tenant access and lazily materializes KPIs when needed.

#### `GET /dashboard/projects`

- Query params:

```json
{
  "organization_id": "org_123",
  "status": "active",
  "limit": 20
}
```

- Notes:
  - All query params are optional.
- What it does:
  - Validates optional organization scope in Core.
  - Proxies the request to Dashboard Layer's portfolio endpoint.
  - Returns KPI-focused portfolio cards for every visible project.

#### `GET /projects/:project_id/visibility/summary`

- Query params:

```json
{
  "run_batch_id": "run_batch_123",
  "run_type": "baseline",
  "start_date": "2026-04-01T00:00:00.000Z",
  "end_date": "2026-04-30T23:59:59.999Z"
}
```

- Notes:
  - All query params are optional.
  - Core also accepts Dashboard Layer's camelCase query aliases such as `runBatchId` and `startDate`.
- What it does: validates project access and proxies the canonical KPI summary request to Dashboard Layer.

#### `GET /projects/:project_id/visibility/models`

- What it does: validates project access and proxies the model-level dashboard breakdown request to Dashboard Layer.

#### `GET /projects/:project_id/visibility/clusters`

- What it does: validates project access and proxies the cluster-level dashboard breakdown request to Dashboard Layer.

#### `GET /projects/:project_id/visibility/competitors`

- What it does: validates project access and proxies the competitor-pressure breakdown request to Dashboard Layer.

#### `GET /projects/:project_id/visibility/trends`

- What it does: validates project access and proxies chart-ready trend data from Dashboard Layer.

#### `GET /run-batches/:run_batch_id/results`

- Payload: none
- What it does:
  - Loads the run batch from Prompt Runner so Core can validate access to the owning project.
  - Proxies the run-results dashboard request to Dashboard Layer.
  - Returns the run KPI summary plus model, cluster, and competitor breakdowns.

## Data model

Supabase SQL migrations live under [supabase/migrations](/Users/manuelpalma/Work/Personals/qoteon/qoteon_core_api/supabase/migrations).

Tables created:

- `public.core_users`
- `public.core_organizations`
- `public.core_organization_users`
- `public.core_projects`
- `public.core_project_competitors`

## Commands

```bash
npm install
npm run db:migrate
npm run build
npm test
```

`npm run db:migrate` uses `psql` against `DATABASE_URL` and applies every `.sql` file in `supabase/migrations` in filename order.

Required database env vars:

```bash
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.<project-ref>.supabase.co:5432/postgres
DATABASE_SSL_MODE=no-verify
DATABASE_CA_CERT_PATH=
```

Downstream service env vars:

```bash
SOURCE_INTELLIGENCE_BASE_URL=http://qoteon-source-intelligence-api:3000
SOURCE_INTELLIGENCE_AUTH_TOKEN=
PROMPT_LIBRARY_BASE_URL=http://qoteon-prompt-library:3000
PROMPT_LIBRARY_AUTH_TOKEN=
PROMPT_RUNNER_BASE_URL=http://qoteon-prompt-runner-api:3000
PROMPT_RUNNER_AUTH_TOKEN=
```

Auth env vars are only needed when `AUTH_MODE=supabase`:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
```
