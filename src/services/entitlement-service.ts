import {
  MeteredQuotaKey,
  Organization,
  OrganizationUsageCounter,
  PlanType,
} from "../domain/core";
import { ConflictError, ValidationError } from "../errors/app-error";
import { get_plan_definition } from "../lib/plan-catalog";
import { OrganizationUsageRepository } from "../repositories/organization-usage-repository";

type ComputeAction =
  | "project_setup"
  | "prompt_generation"
  | "run_launch"
  | "crawl_trigger"
  | "article_generation"
  | "page_improvement_generation";

interface UsagePeriodWindow {
  period_key: string;
  period_started_at: string;
  period_ends_at: string | null;
  limit: number;
}

export class EntitlementService {
  constructor(private readonly organization_usage_repository: OrganizationUsageRepository) {}

  get_plan_definition(plan_type: PlanType) {
    return get_plan_definition(plan_type);
  }

  assert_compute_access(organization: Organization, action: ComputeAction, now = new Date()): void {
    if (this.is_compute_access_active(organization, now)) {
      return;
    }

    throw new ConflictError("This organization can no longer run compute actions on the current plan.", {
      organization_id: organization.id,
      plan_type: organization.plan_type,
      billing_status: organization.billing_status,
      action,
      trial_expires_at: organization.trial_expires_at,
      billing_period_ends_at: organization.billing_period_ends_at,
    });
  }

  is_compute_access_active(organization: Organization, now = new Date()): boolean {
    if (organization.plan_type === "trial") {
      if (organization.billing_status === "expired" || organization.billing_status === "cancelled") {
        return false;
      }

      if (!organization.trial_expires_at) {
        return true;
      }

      return new Date(organization.trial_expires_at).getTime() > now.getTime();
    }

    if (organization.billing_status !== "active") {
      return false;
    }

    if (!organization.billing_period_ends_at) {
      return true;
    }

    return new Date(organization.billing_period_ends_at).getTime() > now.getTime();
  }

  assert_project_limit(organization: Organization, total_project_count: number): void {
    if (total_project_count <= organization.project_limit) {
      return;
    }

    throw new ValidationError(
      `The ${organization.plan_type} plan supports up to ${organization.project_limit} domains.`,
      {
        organization_id: organization.id,
        plan_type: organization.plan_type,
        domain_limit: organization.project_limit,
        requested_project_count: total_project_count,
      },
    );
  }

  assert_competitor_limit(organization: Organization, total_competitor_count: number): void {
    if (total_competitor_count <= organization.competitor_limit) {
      return;
    }

    throw new ValidationError(
      `The ${organization.plan_type} plan supports up to ${organization.competitor_limit} competitors.`,
      {
        organization_id: organization.id,
        plan_type: organization.plan_type,
        competitor_limit: organization.competitor_limit,
        requested_competitor_count: total_competitor_count,
      },
    );
  }

  assert_tracked_model_limit(organization: Organization, requested_model_count: number): void {
    if (requested_model_count <= organization.tracked_model_limit) {
      return;
    }

    throw new ValidationError(
      `The ${organization.plan_type} plan supports up to ${organization.tracked_model_limit} tracked models per run.`,
      {
        organization_id: organization.id,
        plan_type: organization.plan_type,
        tracked_model_limit: organization.tracked_model_limit,
        requested_model_count,
      },
    );
  }

  get_daily_tracking_prompt_limit(organization: Organization): number {
    return organization.tracked_prompts_daily_limit;
  }

  get_retention_cutoff(organization: Organization, now = new Date()): string | null {
    if (organization.data_retention_months === null) {
      return null;
    }

    const cutoff = new Date(now);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - organization.data_retention_months);
    return cutoff.toISOString();
  }

  async get_usage_counter(
    organization: Organization,
    quota_key: MeteredQuotaKey,
    now = new Date(),
  ): Promise<OrganizationUsageCounter | null> {
    const period = this.get_usage_period_window(organization, quota_key, now);
    return this.organization_usage_repository.get_usage_counter(
      organization.id,
      quota_key,
      period.period_key,
    );
  }

  async consume_metered_quota(
    organization: Organization,
    quota_key: MeteredQuotaKey,
    amount: number,
    now = new Date(),
  ): Promise<{ counter: OrganizationUsageCounter; period: UsagePeriodWindow }> {
    const period = this.get_usage_period_window(organization, quota_key, now);
    const counter = await this.organization_usage_repository.consume_usage(
      organization.id,
      quota_key,
      period.period_key,
      amount,
      period.limit,
    );

    return { counter, period };
  }

  async release_metered_quota(
    organization: Organization,
    quota_key: MeteredQuotaKey,
    amount: number,
    period_key: string,
  ): Promise<OrganizationUsageCounter> {
    return this.organization_usage_repository.release_usage(
      organization.id,
      quota_key,
      period_key,
      amount,
    );
  }

  get_usage_period_window(
    organization: Organization,
    quota_key: MeteredQuotaKey,
    now = new Date(),
  ): UsagePeriodWindow {
    const normalized_now = new Date(now);
    const limit = get_metered_limit_from_organization(organization, quota_key);

    if (quota_key === "tracked_prompts_daily") {
      const day = normalized_now.toISOString().slice(0, 10);
      return {
        period_key: `${quota_key}:${day}`,
        period_started_at: `${day}T00:00:00.000Z`,
        period_ends_at: `${day}T23:59:59.999Z`,
        limit,
      };
    }

    if (organization.plan_type === "trial") {
      const period_started_at =
        organization.trial_started_at ?? organization.created_at;
      const period_ends_at =
        organization.trial_expires_at ?? add_days(period_started_at, 3);

      return {
        period_key: `${quota_key}:trial:${period_started_at}`,
        period_started_at,
        period_ends_at,
        limit,
      };
    }

    const period_started_at =
      organization.billing_period_started_at ??
      start_of_utc_month(normalized_now).toISOString();
    const period_ends_at =
      organization.billing_period_ends_at ??
      start_of_next_utc_month(normalized_now).toISOString();

    return {
      period_key: `${quota_key}:billing:${period_started_at}`,
      period_started_at,
      period_ends_at,
      limit,
    };
  }
}

function get_metered_limit_from_organization(
  organization: Organization,
  quota_key: MeteredQuotaKey,
): number {
  switch (quota_key) {
    case "tracked_prompts_daily":
      return organization.tracked_prompts_daily_limit;
    case "llm_responses":
      return organization.llm_response_limit;
    case "article_drafts":
      return organization.article_draft_limit;
    case "page_improvements":
      return organization.page_improvement_limit;
    case "crawled_pages":
      return organization.crawled_page_limit;
  }
}

function add_days(iso_string: string, days: number): string {
  const value = new Date(iso_string);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString();
}

function start_of_utc_month(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1, 0, 0, 0, 0));
}

function start_of_next_utc_month(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}
