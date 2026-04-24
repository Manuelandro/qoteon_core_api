import { type Pool } from "pg";
import { FastifyBaseLogger } from "fastify";

import { JsonLogger } from "./lib/logger";
import { DashboardLayerClient } from "./clients/dashboard-layer-client";
import { DailyRunnerClient } from "./clients/daily-runner-client";
import { HttpDashboardLayerClient } from "./clients/http-dashboard-layer-client";
import { HttpDailyRunnerClient } from "./clients/http-daily-runner-client";
import { HttpJsonClient } from "./clients/http-client";
import { HttpPromptLibraryClient } from "./clients/http-prompt-library-client";
import { HttpPromptRunnerClient } from "./clients/http-prompt-runner-client";
import { HttpReconcilerClient } from "./clients/http-reconciler-client";
import { HttpSourceIntelligenceClient } from "./clients/http-source-intelligence-client";
import { PromptLibraryClient } from "./clients/prompt-library-client";
import { PromptRunnerClient } from "./clients/prompt-runner-client";
import { ReconcilerClient } from "./clients/reconciler-client";
import { SourceIntelligenceClient } from "./clients/source-intelligence-client";
import { Env } from "./config/env";
import { create_database_pool } from "./db/postgres";
import { create_supabase_auth_client } from "./lib/supabase-auth";
import { OrganizationRepository } from "./repositories/organization-repository";
import { OrganizationUsageRepository } from "./repositories/organization-usage-repository";
import { PostgresOrganizationRepository } from "./repositories/postgres-organization-repository";
import { PostgresOrganizationUsageRepository } from "./repositories/postgres-organization-usage-repository";
import { PostgresProjectRepository } from "./repositories/postgres-project-repository";
import { PostgresUserRepository } from "./repositories/postgres-user-repository";
import { PostgresWorkflowIdempotencyRepository } from "./repositories/postgres-workflow-idempotency-repository";
import { ProjectRepository } from "./repositories/project-repository";
import { UserRepository } from "./repositories/user-repository";
import { AuthService, SupabaseAuthService } from "./services/auth-service";
import { DashboardService } from "./services/dashboard-service";
import { AdminRunService } from "./services/admin-run-service";
import { DailyRunnerAdminService } from "./services/daily-runner-admin-service";
import { EntitlementService } from "./services/entitlement-service";
import { OrchestrationService } from "./services/orchestration-service";
import { OrganizationService } from "./services/organization-service";
import { ProjectService } from "./services/project-service";
import { ReconcilerAdminService } from "./services/reconciler-admin-service";
import {
  PostgresWorkflowConcurrencyGuard,
  WorkflowRequestService,
} from "./services/workflow-request-service";

export interface AppServices {
  auth_service: AuthService;
  organization_service: OrganizationService;
  project_service: ProjectService;
  dashboard_service: DashboardService;
  orchestration_service: OrchestrationService;
  workflow_request_service: WorkflowRequestService;
  reconciler_admin_service: ReconcilerAdminService;
  daily_runner_admin_service: DailyRunnerAdminService;
  admin_run_service: AdminRunService;
}

export interface AppRuntime {
  close: () => Promise<void>;
  services: AppServices;
}

export function create_app_runtime(
  env: Env,
  logger?: FastifyBaseLogger,
  structured_logger?: JsonLogger,
): AppRuntime {
  const pool = create_database_pool({
    connection_string: env.DATABASE_URL,
    ssl_mode: env.DATABASE_SSL_MODE,
    ...(env.DATABASE_SSL_CA_FILE ? { ssl_ca_file: env.DATABASE_SSL_CA_FILE } : {}),
    ...(env.DATABASE_SSL_CERT_FILE ? { ssl_cert_file: env.DATABASE_SSL_CERT_FILE } : {}),
    ...(env.DATABASE_SSL_KEY_FILE ? { ssl_key_file: env.DATABASE_SSL_KEY_FILE } : {}),
  });

  const services = create_app_services(env, pool, logger, structured_logger);

  return {
    services,
    close: async () => {
      await pool.end();
    },
  };
}

export function create_app_services(
  env: Env,
  pool: Pool,
  logger?: Pick<FastifyBaseLogger, "info" | "error">,
  structured_logger?: JsonLogger,
): AppServices {
  const promptLibraryTimeoutMs = 75_000;
  const user_repository: UserRepository = new PostgresUserRepository(pool);
  const organization_repository: OrganizationRepository = new PostgresOrganizationRepository(pool);
  const organization_usage_repository: OrganizationUsageRepository =
    new PostgresOrganizationUsageRepository(pool);
  const project_repository: ProjectRepository = new PostgresProjectRepository(pool);

  const prompt_library_client: PromptLibraryClient = new HttpPromptLibraryClient(
    new HttpJsonClient({
      service: "prompt_library",
      base_url: env.PROMPT_LIBRARY_BASE_URL,
      auth_token: env.PROMPT_LIBRARY_AUTH_TOKEN,
      timeout_ms: promptLibraryTimeoutMs,
      logger,
    }),
  );

  const prompt_runner_client: PromptRunnerClient = new HttpPromptRunnerClient(
    new HttpJsonClient({
      service: "prompt_runner",
      base_url: env.PROMPT_RUNNER_BASE_URL,
      auth_token: env.PROMPT_RUNNER_AUTH_TOKEN,
      timeout_ms: 20_000,
      logger,
    }),
  );

  const source_intelligence_client: SourceIntelligenceClient = new HttpSourceIntelligenceClient(
    new HttpJsonClient({
      service: "source_intelligence",
      base_url: env.SOURCE_INTELLIGENCE_BASE_URL,
      auth_token: env.SOURCE_INTELLIGENCE_AUTH_TOKEN,
      logger,
    }),
  );

  const dashboard_layer_client: DashboardLayerClient = new HttpDashboardLayerClient(
    new HttpJsonClient({
      service: "dashboard_layer",
      base_url: env.DASHBOARD_LAYER_BASE_URL,
      auth_token: env.DASHBOARD_LAYER_AUTH_TOKEN,
      logger,
    }),
  );

  const auth_service: AuthService = new SupabaseAuthService(
    create_supabase_auth_client(env),
    user_repository,
  );
  const reconciler_client: ReconcilerClient = new HttpReconcilerClient(
    new HttpJsonClient({
      service: "reconciler",
      base_url: env.RECONCILER_BASE_URL,
      auth_token: env.RECONCILER_AUTH_TOKEN,
      timeout_ms: 20000,
      logger,
    }),
  );
  const daily_runner_client: DailyRunnerClient = new HttpDailyRunnerClient(
    new HttpJsonClient({
      service: "daily_runner",
      base_url: env.DAILY_RUNNER_BASE_URL,
      auth_token: env.DAILY_RUNNER_AUTH_TOKEN,
      timeout_ms: 20000,
      logger,
    }),
  );

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
    reconciler_client,
  );
  const orchestration_service = new OrchestrationService(
    project_service,
    prompt_library_client,
    prompt_runner_client,
    source_intelligence_client,
    dashboard_service,
    entitlement_service,
    structured_logger,
  );
  const workflow_idempotency_repository = new PostgresWorkflowIdempotencyRepository(pool);
  const workflow_concurrency_guard = new PostgresWorkflowConcurrencyGuard(pool);
  const workflow_request_service = new WorkflowRequestService(
    orchestration_service,
    workflow_idempotency_repository,
    workflow_concurrency_guard,
    {
      explicit_idempotency_ttl_seconds: env.CORE_IDEMPOTENCY_EXPLICIT_TTL_SECONDS,
      implicit_idempotency_ttl_seconds: env.CORE_IDEMPOTENCY_IMPLICIT_TTL_SECONDS,
      require_idempotency_header: env.CORE_IDEMPOTENCY_REQUIRE_HEADER,
    },
  );
  const reconciler_admin_service = new ReconcilerAdminService(reconciler_client);
  const daily_runner_admin_service = new DailyRunnerAdminService(daily_runner_client);
  const admin_run_service = new AdminRunService(reconciler_client, daily_runner_client);

  return {
    auth_service,
    organization_service,
    project_service,
    dashboard_service,
    orchestration_service,
    workflow_request_service,
    reconciler_admin_service,
    daily_runner_admin_service,
    admin_run_service,
  };
}
