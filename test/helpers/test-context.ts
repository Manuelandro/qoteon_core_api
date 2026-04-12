import { build_app } from "../../src/app";
import { read_env } from "../../src/config/env";
import { AuthenticatedUser, Organization, Project, PromptRecord, RunProgress, RunType } from "../../src/domain/core";
import { DashboardService } from "../../src/services/dashboard-service";
import { AuthService } from "../../src/services/auth-service";
import { EntitlementService } from "../../src/services/entitlement-service";
import { OrchestrationService } from "../../src/services/orchestration-service";
import { OrganizationService } from "../../src/services/organization-service";
import { ProjectService } from "../../src/services/project-service";
import { AppServices } from "../../src/build-services";
import { InMemoryWorkflowIdempotencyRepository } from "../../src/repositories/in-memory-workflow-idempotency-repository";
import {
  InMemoryOrganizationRepository,
  InMemoryOrganizationUsageRepository,
  InMemoryProjectRepository,
} from "../fakes/in-memory-repositories";
import { get_plan_definition } from "../../src/lib/plan-catalog";
import {
  FakeDashboardLayerClient,
  FakePromptLibraryClient,
  FakePromptRunnerClient,
  FakeSourceIntelligenceClient,
} from "../fakes/fake-clients";
import {
  InMemoryWorkflowConcurrencyGuard,
  WorkflowRequestService,
} from "../../src/services/workflow-request-service";

class TestAuthService implements AuthService {
  private current_user: AuthenticatedUser = {
    user_id: "user-1",
    email: "user-1@example.com",
    full_name: "Test User",
    role: "owner",
  };

  set_current_user(user: Partial<AuthenticatedUser> & Pick<AuthenticatedUser, "user_id">): void {
    this.current_user = {
      user_id: user.user_id,
      email: user.email ?? this.current_user.email ?? `${user.user_id}@example.com`,
      full_name: user.full_name ?? this.current_user.full_name ?? "Test User",
      role: user.role ?? this.current_user.role ?? "owner",
    };
  }

  async authenticate(): Promise<AuthenticatedUser> {
    return this.current_user;
  }
}

export function create_test_context() {
  const organization_repository = new InMemoryOrganizationRepository();
  const organization_usage_repository = new InMemoryOrganizationUsageRepository();
  const project_repository = new InMemoryProjectRepository();
  const prompt_library_client = new FakePromptLibraryClient();
  const prompt_runner_client = new FakePromptRunnerClient();
  const source_intelligence_client = new FakeSourceIntelligenceClient();
  const dashboard_layer_client = new FakeDashboardLayerClient();
  const auth_service = new TestAuthService();

  const entitlement_service = new EntitlementService(organization_usage_repository);
  const organization_service = new OrganizationService(organization_repository);
  const project_service = new ProjectService(
    organization_repository,
    project_repository,
    entitlement_service,
  );
  const dashboard_service = new DashboardService(
    project_service,
    prompt_runner_client,
    dashboard_layer_client,
  );
  const orchestration_service = new OrchestrationService(
    project_service,
    prompt_library_client,
    prompt_runner_client,
    source_intelligence_client,
    dashboard_service,
    entitlement_service,
  );
  const workflow_request_service = new WorkflowRequestService(
    orchestration_service,
    new InMemoryWorkflowIdempotencyRepository(),
    new InMemoryWorkflowConcurrencyGuard(),
    {
      explicit_idempotency_ttl_seconds: 60,
      implicit_idempotency_ttl_seconds: 5,
      require_idempotency_header: false,
    },
  );

  const services: AppServices = {
    auth_service,
    organization_service,
    project_service,
    dashboard_service,
    orchestration_service,
    workflow_request_service,
  };

  return {
    services,
    repositories: {
      organization_repository,
      organization_usage_repository,
      project_repository,
    },
    clients: {
      prompt_library_client,
      prompt_runner_client,
      source_intelligence_client,
      dashboard_layer_client,
    },
    set_current_user(user: Partial<AuthenticatedUser> & Pick<AuthenticatedUser, "user_id">) {
      auth_service.set_current_user(user);
    },
    async build_app(env_overrides: Record<string, string> = {}) {
      const app = build_app({
        logger: false,
        env: read_env({
          DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/postgres",
          SUPABASE_URL: "https://example.supabase.co",
          SUPABASE_ANON_KEY: "test-anon-key",
          ...env_overrides,
        }),
        services,
      });
      await app.ready();
      return app;
    },
    async seed_organization(
      user_id = "user-1",
      plan_type: Organization["plan_type"] = "starter",
      overrides?: Partial<Organization>,
    ): Promise<Organization> {
      const plan_definition = get_plan_definition(plan_type);
      const now = new Date();
      const organization = await organization_repository.create_organization({
        name: "Acme",
        slug: "acme",
        plan_type,
        billing_status: plan_type === "trial" ? "trialing" : "active",
        project_limit: plan_definition.project_limit,
        competitor_limit: plan_definition.competitor_limit,
        tracked_model_limit: plan_definition.tracked_model_limit,
        tracked_prompts_daily_limit: plan_definition.tracked_prompts_daily_limit,
        llm_response_limit: plan_definition.llm_response_limit,
        article_draft_limit: plan_definition.article_draft_limit,
        page_improvement_limit: plan_definition.page_improvement_limit,
        crawled_page_limit: plan_definition.crawled_page_limit,
        data_retention_months: plan_definition.data_retention_months,
        trial_started_at: plan_type === "trial" ? now.toISOString() : null,
        trial_expires_at:
          plan_type === "trial"
            ? new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString()
            : null,
        billing_period_started_at: plan_type === "trial" ? null : now.toISOString(),
        billing_period_ends_at:
          plan_type === "trial"
            ? null
            : new Date(
                Date.UTC(
                  now.getUTCFullYear(),
                  now.getUTCMonth() + 1,
                  now.getUTCDate(),
                  now.getUTCHours(),
                  now.getUTCMinutes(),
                  now.getUTCSeconds(),
                  now.getUTCMilliseconds(),
                ),
              ).toISOString(),
        stripe_customer_id: null,
        stripe_subscription_id: null,
      });

      await organization_repository.add_user_to_organization({
        organization_id: organization.id,
        user_id,
        org_role: "owner",
      });

      if (overrides) {
        Object.assign(organization, overrides);
      }

      return organization;
    },
    async seed_project(
      user_id = "user-1",
      organization_id?: string,
      overrides?: Partial<Project>,
    ): Promise<Project> {
      const organization = organization_id
        ? await organization_repository.get_organization_by_id(organization_id)
        : await this.seed_organization(user_id);

      const project = await project_service.create_project(user_id, {
        organization_id: organization?.id ?? "org-missing",
        name: "Acme Project",
        domain: "acme.com",
        company_name: "Acme",
        primary_category: "SaaS",
        target_region: ["United States"],
        target_language: "en",
        status: "active",
      });

      if (!overrides) {
        return project;
      }

      return project_repository.update_project(project.id, overrides) as Promise<Project>;
    },
    seed_prompts(project_id: string, prompts: PromptRecord[]): void {
      prompt_library_client.set_prompts(project_id, prompts);
    },
    seed_prompt_set(project_id: string, run_type: RunType, prompt_ids: string[]): void {
      prompt_library_client.set_prompt_set(project_id, run_type, prompt_ids);
    },
    set_run_progress(run_batch_id: string, progress: RunProgress): void {
      prompt_runner_client.set_run_progress(run_batch_id, progress);
    },
  };
}
