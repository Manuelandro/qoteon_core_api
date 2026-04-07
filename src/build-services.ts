import { HttpJsonClient } from "./clients/http-client";
import { HttpPromptLibraryClient } from "./clients/http-prompt-library-client";
import { HttpPromptRunnerClient } from "./clients/http-prompt-runner-client";
import { PromptLibraryClient } from "./clients/prompt-library-client";
import { PromptRunnerClient } from "./clients/prompt-runner-client";
import { Env } from "./config/env";
import { create_supabase_admin_client, create_supabase_auth_client } from "./lib/supabase";
import { OrganizationRepository } from "./repositories/organization-repository";
import { ProjectRepository } from "./repositories/project-repository";
import { SupabaseOrganizationRepository } from "./repositories/supabase-organization-repository";
import { SupabaseProjectRepository } from "./repositories/supabase-project-repository";
import { SupabaseUserRepository } from "./repositories/supabase-user-repository";
import { UserRepository } from "./repositories/user-repository";
import { AuthService, StubAuthService, SupabaseAuthService } from "./services/auth-service";
import { DashboardService } from "./services/dashboard-service";
import { OrchestrationService } from "./services/orchestration-service";
import { OrganizationService } from "./services/organization-service";
import { ProjectService } from "./services/project-service";

export interface AppServices {
  auth_service: AuthService;
  organization_service: OrganizationService;
  project_service: ProjectService;
  dashboard_service: DashboardService;
  orchestration_service: OrchestrationService;
}

export function create_app_services(env: Env): AppServices {
  const supabase_admin_client = create_supabase_admin_client(env);
  const user_repository: UserRepository = new SupabaseUserRepository(supabase_admin_client);
  const organization_repository: OrganizationRepository = new SupabaseOrganizationRepository(
    supabase_admin_client,
  );
  const project_repository: ProjectRepository = new SupabaseProjectRepository(supabase_admin_client);

  const prompt_library_client: PromptLibraryClient = new HttpPromptLibraryClient(
    new HttpJsonClient({
      service: "prompt_library",
      base_url: env.PROMPT_LIBRARY_BASE_URL,
      auth_token: env.PROMPT_LIBRARY_AUTH_TOKEN,
    }),
  );

  const prompt_runner_client: PromptRunnerClient = new HttpPromptRunnerClient(
    new HttpJsonClient({
      service: "prompt_runner",
      base_url: env.PROMPT_RUNNER_BASE_URL,
      auth_token: env.PROMPT_RUNNER_AUTH_TOKEN,
    }),
  );

  const auth_service: AuthService =
    env.AUTH_MODE === "supabase"
      ? new SupabaseAuthService(create_supabase_auth_client(env), user_repository)
      : new StubAuthService();

  const organization_service = new OrganizationService(organization_repository);
  const project_service = new ProjectService(organization_repository, project_repository);
  const dashboard_service = new DashboardService(
    project_service,
    project_repository,
    prompt_library_client,
    prompt_runner_client,
  );
  const orchestration_service = new OrchestrationService(
    project_service,
    prompt_library_client,
    prompt_runner_client,
    dashboard_service,
  );

  return {
    auth_service,
    organization_service,
    project_service,
    dashboard_service,
    orchestration_service,
  };
}
