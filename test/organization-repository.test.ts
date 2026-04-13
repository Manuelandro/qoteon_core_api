import test from "node:test";
import assert from "node:assert/strict";

import type { Pool } from "pg";

import { PostgresOrganizationRepository } from "../src/repositories/postgres-organization-repository";

test("organization repository inserts all organization billing fields", async () => {
  let captured_query = "";
  let captured_values: unknown[] = [];

  const pool = {
    async query(query: string, values: unknown[]) {
      captured_query = query;
      captured_values = values;

      return {
        rows: [
          {
            id: "org-1",
            name: "Acme",
            slug: "acme",
            plan_type: "trial",
            billing_status: "trialing",
            project_limit: 1,
            competitor_limit: 3,
            tracked_model_limit: 3,
            tracked_prompts_daily_limit: 100,
            llm_response_limit: 500,
            article_draft_limit: 0,
            page_improvement_limit: 0,
            crawled_page_limit: 200,
            data_retention_months: 1,
            trial_started_at: "2026-04-13T10:00:00.000Z",
            trial_expires_at: "2026-04-16T10:00:00.000Z",
            billing_period_started_at: null,
            billing_period_ends_at: null,
            stripe_customer_id: null,
            stripe_subscription_id: null,
            created_at: "2026-04-13T10:00:00.000Z",
            updated_at: "2026-04-13T10:00:00.000Z",
          },
        ],
      };
    },
  } as Pick<Pool, "query"> as Pool;

  const repository = new PostgresOrganizationRepository(pool);

  const organization = await repository.create_organization({
    name: "Acme",
    slug: "acme",
    plan_type: "trial",
    billing_status: "trialing",
    project_limit: 1,
    competitor_limit: 3,
    tracked_model_limit: 3,
    tracked_prompts_daily_limit: 100,
    llm_response_limit: 500,
    article_draft_limit: 0,
    page_improvement_limit: 0,
    crawled_page_limit: 200,
    data_retention_months: 1,
    trial_started_at: "2026-04-13T10:00:00.000Z",
    trial_expires_at: "2026-04-16T10:00:00.000Z",
    billing_period_started_at: null,
    billing_period_ends_at: null,
    stripe_customer_id: null,
    stripe_subscription_id: null,
  });

  assert.equal(organization.id, "org-1");
  assert.equal(captured_values.length, 19);
  assert.match(captured_query, /\$19\b/);
});
