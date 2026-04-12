import { AuthenticatedUser, Organization } from "../domain/core";
import { AccessActor, resolve_access_actor } from "../lib/access-actor";
import { get_plan_definition } from "../lib/plan-catalog";
import { slugify } from "../lib/slug";
import { OrganizationRepository } from "../repositories/organization-repository";

export interface CreateOrganizationRequest {
  name: string;
  slug?: string;
  plan_type: Organization["plan_type"];
}

export class OrganizationService {
  constructor(private readonly organization_repository: OrganizationRepository) {}

  async create_organization_for_user(
    user: AuthenticatedUser,
    input: CreateOrganizationRequest,
  ): Promise<Organization> {
    const now = new Date();
    const plan_definition = get_plan_definition(input.plan_type);
    const billing_defaults =
      input.plan_type === "trial"
        ? {
            billing_status: "trialing" as const,
            trial_started_at: now.toISOString(),
            trial_expires_at: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
            billing_period_started_at: null,
            billing_period_ends_at: null,
          }
        : {
            billing_status: "active" as const,
            trial_started_at: null,
            trial_expires_at: null,
            billing_period_started_at: now.toISOString(),
            billing_period_ends_at: new Date(
              Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds()),
            ).toISOString(),
          };

    const organization = await this.organization_repository.create_organization({
      name: input.name,
      slug: input.slug ? slugify(input.slug) : slugify(input.name),
      plan_type: input.plan_type,
      billing_status: billing_defaults.billing_status,
      project_limit: plan_definition.project_limit,
      competitor_limit: plan_definition.competitor_limit,
      tracked_model_limit: plan_definition.tracked_model_limit,
      tracked_prompts_daily_limit: plan_definition.tracked_prompts_daily_limit,
      llm_response_limit: plan_definition.llm_response_limit,
      article_draft_limit: plan_definition.article_draft_limit,
      page_improvement_limit: plan_definition.page_improvement_limit,
      crawled_page_limit: plan_definition.crawled_page_limit,
      data_retention_months: plan_definition.data_retention_months,
      trial_started_at: billing_defaults.trial_started_at,
      trial_expires_at: billing_defaults.trial_expires_at,
      billing_period_started_at: billing_defaults.billing_period_started_at,
      billing_period_ends_at: billing_defaults.billing_period_ends_at,
      stripe_customer_id: null,
      stripe_subscription_id: null,
    });

    await this.organization_repository.add_user_to_organization({
      organization_id: organization.id,
      user_id: user.user_id,
      org_role: "owner",
    });

    return organization;
  }

  async list_organizations_for_user(user: AccessActor): Promise<Organization[]> {
    const actor = resolve_access_actor(user);

    if (actor.role === "admin") {
      return this.organization_repository.list_all_organizations();
    }

    return this.organization_repository.list_organizations_for_user(actor.user_id);
  }
}
