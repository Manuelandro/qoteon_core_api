import test from "node:test";
import assert from "node:assert/strict";

import { get_plan_definition } from "../src/lib/plan-catalog";
import { EntitlementService } from "../src/services/entitlement-service";
import { InMemoryOrganizationUsageRepository } from "./fakes/in-memory-repositories";
import type { Organization } from "../src/domain/core";

function buildOrganization(input: Partial<Organization> & Pick<Organization, "id" | "plan_type">): Organization {
  const plan = get_plan_definition(input.plan_type);

  return {
    id: input.id,
    name: input.name ?? "Acme",
    slug: input.slug ?? "acme",
    plan_type: input.plan_type,
    billing_status:
      input.billing_status ?? (input.plan_type === "trial" ? "trialing" : "active"),
    project_limit: input.project_limit ?? plan.project_limit,
    competitor_limit: input.competitor_limit ?? plan.competitor_limit,
    tracked_model_limit: input.tracked_model_limit ?? plan.tracked_model_limit,
    tracked_prompts_daily_limit:
      input.tracked_prompts_daily_limit ?? plan.tracked_prompts_daily_limit,
    llm_response_limit: input.llm_response_limit ?? plan.llm_response_limit,
    article_draft_limit: input.article_draft_limit ?? plan.article_draft_limit,
    page_improvement_limit: input.page_improvement_limit ?? plan.page_improvement_limit,
    crawled_page_limit: input.crawled_page_limit ?? plan.crawled_page_limit,
    data_retention_months: input.data_retention_months ?? plan.data_retention_months,
    trial_started_at: input.trial_started_at ?? "2026-04-12T00:00:00.000Z",
    trial_expires_at: input.trial_expires_at ?? "2026-04-15T00:00:00.000Z",
    billing_period_started_at: input.billing_period_started_at ?? "2026-04-01T00:00:00.000Z",
    billing_period_ends_at: input.billing_period_ends_at ?? "2026-05-01T00:00:00.000Z",
    stripe_customer_id: input.stripe_customer_id ?? null,
    stripe_subscription_id: input.stripe_subscription_id ?? null,
    created_at: input.created_at ?? "2026-04-12T00:00:00.000Z",
    updated_at: input.updated_at ?? "2026-04-12T00:00:00.000Z",
  };
}

test("plan catalog exposes the expected enterprise retention and trial limits", () => {
  const enterprise = get_plan_definition("enterprise");
  const trial = get_plan_definition("trial");

  assert.equal(enterprise.data_retention_months, 4);
  assert.equal(enterprise.crawled_page_limit, 10000);
  assert.equal(trial.project_limit, 1);
  assert.equal(trial.tracked_prompts_daily_limit, 5);
});

test("usage periods reset daily for tracked prompts and monthly for paid response quotas", () => {
  const service = new EntitlementService(new InMemoryOrganizationUsageRepository());
  const growthOrganization = buildOrganization({
    id: "org-growth",
    plan_type: "growth",
    billing_period_started_at: "2026-04-01T00:00:00.000Z",
    billing_period_ends_at: "2026-05-01T00:00:00.000Z",
  });

  const dailyWindow = service.get_usage_period_window(
    growthOrganization,
    "tracked_prompts_daily",
    new Date("2026-04-12T10:30:00.000Z"),
  );
  const monthlyWindow = service.get_usage_period_window(
    growthOrganization,
    "llm_responses",
    new Date("2026-04-12T10:30:00.000Z"),
  );

  assert.equal(dailyWindow.period_key, "tracked_prompts_daily:2026-04-12");
  assert.equal(monthlyWindow.period_key, "llm_responses:billing:2026-04-01T00:00:00.000Z");
});

test("trial quotas use the full trial window instead of a monthly billing period", () => {
  const service = new EntitlementService(new InMemoryOrganizationUsageRepository());
  const trialOrganization = buildOrganization({
    id: "org-trial",
    plan_type: "trial",
    billing_period_started_at: null,
    billing_period_ends_at: null,
  });

  const trialWindow = service.get_usage_period_window(
    trialOrganization,
    "llm_responses",
    new Date("2026-04-13T10:30:00.000Z"),
  );

  assert.equal(trialWindow.period_key, "llm_responses:trial:2026-04-12T00:00:00.000Z");
  assert.equal(trialWindow.period_ends_at, "2026-04-15T00:00:00.000Z");
});
