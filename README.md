# Qoteon Core API

Production-minded Core API / orchestration service for Qoteon.

## What it does

- Serves as the only backend the frontend should call
- Owns organizations, organization membership, projects, and competitors
- Orchestrates Prompt Library and Prompt Runner through client interfaces
- Aggregates frontend-ready dashboard and overview responses
- Keeps workflow logic in services instead of route handlers

## Stack

- Node.js
- TypeScript
- Fastify
- Supabase
- Zod
- Native `node:test`

## Local auth modes

- `AUTH_MODE=stub`
  - Default for local development and tests
  - Reads `x-user-id`, `x-user-email`, `x-user-name`, and `x-user-role`
- `AUTH_MODE=supabase`
  - Verifies Bearer tokens with Supabase Auth
  - Upserts the authenticated user into `public.users`

## Downstream service assumptions

The Core API currently ships with HTTP adapters for:

- Prompt Library
- Prompt Runner

Default Render internal service base URLs:

- Prompt Library: `http://qoteon-prompt-library-agz7:3000`
- Prompt Runner: `http://qoteon-prompt-runner-api:3000`

Those are the defaults used by the app when `PROMPT_LIBRARY_BASE_URL` and `PROMPT_RUNNER_BASE_URL` are not explicitly set.

Render shows Prompt Library as a `TCP` connection and Prompt Runner as an `HTTP` connection in the panel. This codebase still assumes both downstreams expose HTTP APIs. For Prompt Library, that means the app sends HTTP requests to the internal host `qoteon-prompt-library-agz7:3000` over Render's private network. If Prompt Library is actually speaking a non-HTTP protocol on that port, the current adapter must be replaced.

Default internal paths assumed by the adapters:

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

If your Render services expose different paths behind those internal hosts, update the HTTP clients without changing the route or orchestration layers.

## Render deployment notes

- Deploy the Core API, Prompt Library, and Prompt Runner API into the same Render private network.
- The Core API expects to reach Prompt Library at `qoteon-prompt-library-agz7:3000`.
- The Core API expects to reach Prompt Runner API at `qoteon-prompt-runner-api:3000`.
- Prompt Library is currently treated as an HTTP API reachable via its Render internal TCP address.
- Override `PROMPT_LIBRARY_BASE_URL` or `PROMPT_RUNNER_BASE_URL` only if you intentionally change those internal service names or ports.

## API routes

All routes except `GET /health` require authentication.

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
  "generate_initial_prompts": true,
  "prompt_generation_payload": {
    "prompt_count": 20,
    "intents": ["awareness", "comparison"],
    "seed_topics": ["brand", "category"],
    "metadata_json": {
      "source": "onboarding"
    }
  }
}
```

- Notes:
  - `status` is optional.
  - `competitors` is optional.
  - `generate_initial_prompts` defaults to `false`.
  - `prompt_generation_payload` is optional.
- What it does:
  - Validates organization access.
  - Creates the project.
  - Creates competitors if provided.
  - Optionally triggers Prompt Library prompt generation.
  - Returns `success` or `partial_success` if prompt generation fails after project creation.

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
  "prompt_count": 20,
  "intents": ["awareness", "comparison"],
  "seed_topics": ["brand", "category"],
  "metadata_json": {
    "source": "manual_regeneration"
  }
}
```

- What it does: validates project access and asks Prompt Library to regenerate prompts for the project.

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
  - Loads the project and competitors from local tables.
  - Aggregates prompt summary from Prompt Library.
  - Aggregates latest run batches and progress from Prompt Runner.
  - Returns frontend-ready overview data plus warnings if downstream data is partially unavailable.

#### `GET /dashboard/projects`

- Query params:

```json
{
  "organization_id": "org_123",
  "status": "active"
}
```

- Notes:
  - Both query params are optional.
- What it does: returns lightweight dashboard cards for all visible projects, including prompt summary, latest run summary, and warnings when downstream data is unavailable.

## Data model

Supabase SQL migrations live under [supabase/migrations](/Users/manuelpalma/Work/Personals/qoteon_core_api/supabase/migrations).

Tables created:

- `public.users`
- `public.organizations`
- `public.organization_users`
- `public.projects`
- `public.project_competitors`

## Commands

```bash
npm install
npm run build
npm test
```
