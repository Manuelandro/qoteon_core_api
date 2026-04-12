import type { MeteredQuotaKey, PlanType } from "../domain/core";

export interface PlanDefinition {
  plan_type: PlanType;
  project_limit: number;
  competitor_limit: number;
  tracked_model_limit: number;
  tracked_prompts_daily_limit: number;
  llm_response_limit: number;
  article_draft_limit: number;
  page_improvement_limit: number;
  crawled_page_limit: number;
  data_retention_months: number | null;
  trial_duration_days: number | null;
}

export const TRIAL_DURATION_DAYS = 3;

export const PLAN_CATALOG: Record<PlanType, PlanDefinition> = {
  trial: {
    plan_type: "trial",
    project_limit: 1,
    competitor_limit: 3,
    tracked_model_limit: 3,
    tracked_prompts_daily_limit: 5,
    llm_response_limit: 1350,
    article_draft_limit: 1,
    page_improvement_limit: 3,
    crawled_page_limit: 10,
    data_retention_months: null,
    trial_duration_days: TRIAL_DURATION_DAYS,
  },
  starter: {
    plan_type: "starter",
    project_limit: 1,
    competitor_limit: 3,
    tracked_model_limit: 3,
    tracked_prompts_daily_limit: 20,
    llm_response_limit: 1350,
    article_draft_limit: 10,
    page_improvement_limit: 10,
    crawled_page_limit: 750,
    data_retention_months: 3,
    trial_duration_days: null,
  },
  growth: {
    plan_type: "growth",
    project_limit: 3,
    competitor_limit: 6,
    tracked_model_limit: 4,
    tracked_prompts_daily_limit: 50,
    llm_response_limit: 6000,
    article_draft_limit: 20,
    page_improvement_limit: 25,
    crawled_page_limit: 3000,
    data_retention_months: 12,
    trial_duration_days: null,
  },
  enterprise: {
    plan_type: "enterprise",
    project_limit: 5,
    competitor_limit: 10,
    tracked_model_limit: 5,
    tracked_prompts_daily_limit: 150,
    llm_response_limit: 22500,
    article_draft_limit: 30,
    page_improvement_limit: 50,
    crawled_page_limit: 10000,
    data_retention_months: 4,
    trial_duration_days: null,
  },
};

export function get_plan_definition(plan_type: PlanType): PlanDefinition {
  return PLAN_CATALOG[plan_type];
}

export function get_metered_quota_limit(
  plan_type: PlanType,
  quota_key: MeteredQuotaKey,
): number {
  const definition = get_plan_definition(plan_type);

  switch (quota_key) {
    case "tracked_prompts_daily":
      return definition.tracked_prompts_daily_limit;
    case "llm_responses":
      return definition.llm_response_limit;
    case "article_drafts":
      return definition.article_draft_limit;
    case "page_improvements":
      return definition.page_improvement_limit;
    case "crawled_pages":
      return definition.crawled_page_limit;
  }
}
