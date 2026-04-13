import {
  AutomaticInitialBaselineRunResult,
  AutomaticDailyTrackingRunResult,
  CreateCompetitorInput,
  CreateProjectInput,
  ExecutionRecord,
  LaunchRunResult,
  ListExecutionsFilters,
  ListRunBatchesFilters,
  PrefillProjectCompetitorsResult,
  Project,
  ProjectCompetitor,
  PromptRunnerCompetitorSuggestion,
  PromptGenerationPayload,
  PromptGenerationResult,
  PromptListFilters,
  PromptRecord,
  PromptSetSummary,
  RunBatch,
  RunProgress,
  RunType,
  SetupProjectResult,
} from "../domain/core";
import { ConflictError, ValidationError } from "../errors/app-error";
import { AccessActor } from "../lib/access-actor";
import { to_service_warning } from "../lib/warnings";
import { PromptLibraryClient } from "../clients/prompt-library-client";
import { PromptRunnerClient } from "../clients/prompt-runner-client";
import { SourceIntelligenceClient } from "../clients/source-intelligence-client";
import { DashboardService } from "./dashboard-service";
import { EntitlementService } from "./entitlement-service";
import { ProjectService } from "./project-service";

export interface SetupProjectRequest {
  organization_id: string;
  name: string;
  domain: string;
  company_name: string;
  primary_category: string;
  target_region: string[];
  target_language: string;
  status?: CreateProjectInput["status"];
  competitors?: CreateCompetitorInput[];
  generate_initial_prompts?: boolean;
  prompt_generation_payload?: PromptGenerationPayload;
}

const INTERNAL_AUTOMATION_ACTOR = {
  user_id: "internal-automation",
  role: "admin",
} as const;

export class OrchestrationService {
  constructor(
    private readonly project_service: ProjectService,
    private readonly prompt_library_client: PromptLibraryClient,
    private readonly prompt_runner_client: PromptRunnerClient,
    private readonly source_intelligence_client: SourceIntelligenceClient,
    private readonly dashboard_service: DashboardService,
    private readonly entitlement_service: EntitlementService,
  ) {}

  async setup_project(user: AccessActor, input: SetupProjectRequest): Promise<SetupProjectResult> {
    const { organization } = await this.project_service.assert_organization_access(
      user,
      input.organization_id,
    );
    this.entitlement_service.assert_compute_access(organization, "project_setup");

    if (input.competitors?.length) {
      this.entitlement_service.assert_competitor_limit(organization, input.competitors.length);
    }

    const project = await this.project_service.create_project(user, {
      organization_id: input.organization_id,
      name: input.name,
      domain: input.domain,
      company_name: input.company_name,
      primary_category: input.primary_category,
      target_region: input.target_region,
      target_language: input.target_language,
      status: input.status,
    });

    const competitors = input.competitors?.length
      ? await this.project_service.create_competitors(user, project.id, input.competitors)
      : [];
    const warnings =
      project.status === "active" ? await this.bootstrap_source_intelligence(project.id) : [];

    if (!input.generate_initial_prompts) {
      return {
        status: warnings.length > 0 ? "partial_success" : "success",
        project,
        competitors,
        prompt_generation: {
          attempted: false,
          succeeded: false,
          result: null,
        },
        warnings,
      };
    }

    return {
      status: warnings.length > 0 ? "partial_success" : "success",
      project,
      competitors,
      prompt_generation: {
        attempted: false,
        succeeded: false,
        result: null,
      },
      warnings,
    };
  }

  async regenerate_project_prompts(
    user: AccessActor,
    project_id: string,
    payload: PromptGenerationPayload,
  ): Promise<PromptGenerationResult> {
    const project = await this.project_service.assert_project_access(user, project_id);
    const { organization } = await this.project_service.assert_organization_access(
      user,
      project.organization_id,
    );
    this.entitlement_service.assert_compute_access(organization, "prompt_generation");
    const prompt_context = await this.source_intelligence_client.get_prompt_context(project_id);

    if (!prompt_context.is_ready_for_prompt_generation) {
      throw new ConflictError(
        "Prompt generation is blocked until Source Intelligence completes a successful crawl",
        {
          project_id,
          blockers: prompt_context.prompt_generation_blockers,
          last_successful_crawl_at: prompt_context.last_successful_crawl_at,
          crawl_coverage: prompt_context.crawl_coverage,
        },
      );
    }

    const competitors = await this.project_service.list_competitors(user, project_id);

    return this.prompt_library_client.generate_project_prompts(
      project_id,
      build_prompt_generation_payload(project, competitors, payload),
    );
  }

  async list_project_prompts(
    user: AccessActor,
    project_id: string,
    filters?: PromptListFilters,
  ): Promise<PromptRecord[]> {
    await this.project_service.assert_project_access(user, project_id);
    return this.prompt_library_client.list_project_prompts(project_id, filters);
  }

  async get_prompt_set_summary(
    user: AccessActor,
    project_id: string,
    run_type: RunType,
  ): Promise<PromptSetSummary> {
    const project = await this.project_service.assert_project_access(user, project_id);
    const { organization } = await this.project_service.assert_organization_access(
      user,
      project.organization_id,
    );
    const prompt_set = await this.prompt_library_client.get_prompt_set(
      project_id,
      run_type,
      run_type === "daily_tracking"
        ? {
            limit: this.entitlement_service.get_daily_tracking_prompt_limit(organization),
          }
        : undefined,
    );

    return {
      project_id: prompt_set.project_id,
      run_type: prompt_set.run_type,
      prompt_count: prompt_set.prompt_count,
      active_prompt_count: prompt_set.active_prompt_count,
    };
  }

  async activate_prompt(user: AccessActor, project_id: string, prompt_id: string): Promise<PromptRecord> {
    await this.project_service.assert_project_access(user, project_id);
    return this.prompt_library_client.activate_prompt(project_id, prompt_id);
  }

  async deactivate_prompt(
    user: AccessActor,
    project_id: string,
    prompt_id: string,
  ): Promise<PromptRecord> {
    await this.project_service.assert_project_access(user, project_id);
    return this.prompt_library_client.deactivate_prompt(project_id, prompt_id);
  }

  async update_project(
    user: AccessActor,
    project_id: string,
    input: Partial<{
      name: string;
      domain: string;
      company_name: string;
      primary_category: string;
      target_region: string[];
      target_language: string;
      status: Project["status"];
    }>,
  ): Promise<Project> {
    const existingProject = await this.project_service.assert_project_access(user, project_id);
    const project = await this.project_service.update_project(user, project_id, input);

    if (existingProject.status === "active" || project.status !== "active") {
      return project;
    }

    const { organization } = await this.project_service.assert_organization_access(
      user,
      project.organization_id,
    );
    this.entitlement_service.assert_compute_access(organization, "project_setup");

    await this.bootstrap_source_intelligence(project.id);

    return project;
  }

  async launch_baseline_scan(
    user: AccessActor,
    project_id: string,
    ai_model_ids: string[],
    metadata_json?: Record<string, unknown>,
  ): Promise<LaunchRunResult> {
    return this.launch_run(user, project_id, "baseline", ai_model_ids, metadata_json);
  }

  async launch_daily_tracking(
    user: AccessActor,
    project_id: string,
    ai_model_ids: string[],
    metadata_json?: Record<string, unknown>,
  ): Promise<LaunchRunResult> {
    return this.launch_run(user, project_id, "daily_tracking", ai_model_ids, metadata_json);
  }

  async launch_monthly_tracking(
    user: AccessActor,
    project_id: string,
    ai_model_ids: string[],
    metadata_json?: Record<string, unknown>,
  ): Promise<LaunchRunResult> {
    return this.launch_daily_tracking(user, project_id, ai_model_ids, metadata_json);
  }

  async list_project_run_batches(
    user: AccessActor,
    project_id: string,
    filters?: ListRunBatchesFilters,
  ): Promise<RunBatch[]> {
    await this.project_service.assert_project_access(user, project_id);
    return this.prompt_runner_client.list_run_batches(project_id, filters);
  }

  async get_run_batch(user: AccessActor, run_batch_id: string): Promise<RunBatch> {
    const run_batch = await this.prompt_runner_client.get_run_batch(run_batch_id);
    await this.project_service.assert_project_access(user, run_batch.project_id);
    return run_batch;
  }

  async get_run_progress(user: AccessActor, run_batch_id: string): Promise<RunProgress> {
    const run_batch = await this.get_run_batch(user, run_batch_id);
    return this.prompt_runner_client.get_run_progress(run_batch.id);
  }

  async list_executions(
    user: AccessActor,
    run_batch_id: string,
    filters?: ListExecutionsFilters,
  ): Promise<ExecutionRecord[]> {
    const run_batch = await this.get_run_batch(user, run_batch_id);
    return this.prompt_runner_client.list_executions(run_batch.id, filters);
  }

  async retry_execution(
    user: AccessActor,
    run_batch_id: string,
    execution_id: string,
  ): Promise<ExecutionRecord> {
    await this.get_run_batch(user, run_batch_id);
    return this.prompt_runner_client.retry_execution(execution_id);
  }

  async trigger_project_crawl(
    user: AccessActor,
    project_id: string,
    input: {
      target_scope?: "client" | "competitors" | "all";
      competitor_ids?: string[];
      scope_type?: "full" | "incremental" | "single_url";
      max_pages?: number;
      max_depth?: number;
      single_url?: string;
    },
  ) {
    const project = await this.project_service.assert_project_access(user, project_id);
    const { organization } = await this.project_service.assert_organization_access(
      user,
      project.organization_id,
    );
    this.entitlement_service.assert_compute_access(organization, "crawl_trigger");

    return this.source_intelligence_client.create_crawl_runs(project_id, {
      ...input,
      trigger_type: "manual",
    });
  }

  async list_project_crawl_runs(
    user: AccessActor,
    project_id: string,
    filters?: { status?: string; limit?: number },
  ) {
    await this.project_service.assert_project_access(user, project_id);
    return this.source_intelligence_client.list_crawl_runs(project_id, filters);
  }

  async get_project_prompt_context(user: AccessActor, project_id: string) {
    await this.project_service.assert_project_access(user, project_id);
    return this.source_intelligence_client.get_prompt_context(project_id);
  }

  async prepare_automatic_initial_baseline_run(project_id: string): Promise<
    | {
        triggered: true;
        actor: typeof INTERNAL_AUTOMATION_ACTOR;
        ai_model_ids: string[];
        prompt_count: number;
        metadata_json: Record<string, unknown>;
      }
    | {
        triggered: false;
        response: AutomaticInitialBaselineRunResult;
      }
  > {
    const project = await this.project_service.assert_project_access(INTERNAL_AUTOMATION_ACTOR, project_id);
    const { organization } = await this.project_service.assert_organization_access(
      INTERNAL_AUTOMATION_ACTOR,
      project.organization_id,
    );
    this.entitlement_service.assert_compute_access(organization, "run_launch");

    const existing_baseline_runs = await this.prompt_runner_client.list_run_batches(project_id, {
      run_type: "baseline",
      limit: 1,
    });

    const existing_run = existing_baseline_runs[0];

    if (existing_run) {

      return {
        triggered: false,
        response: {
          project_id,
          triggered: false,
          reason: "baseline_already_exists",
          run_batch_id: existing_run.id,
          run_status: existing_run.status,
          ai_model_ids: existing_run.ai_model_ids,
          prompt_count: existing_run.prompt_ids.length,
        },
      };
    }

    const prompt_set = await this.prompt_library_client.get_prompt_set(project_id, "baseline");

    if (prompt_set.prompt_ids.length === 0) {
      throw new ValidationError("No prompts are available for the initial baseline run");
    }

    const selected_ai_models = await this.prompt_runner_client.list_ai_models({
      is_active: true,
      limit: organization.tracked_model_limit,
    });
    const ai_model_ids = selected_ai_models
      .slice(0, organization.tracked_model_limit)
      .map((model) => model.id);

    if (ai_model_ids.length === 0) {
      return {
        triggered: false,
        response: {
          project_id,
          triggered: false,
          reason: "no_active_ai_models",
          run_batch_id: null,
          run_status: null,
          ai_model_ids: [],
          prompt_count: prompt_set.prompt_count,
        },
      };
    }

    return {
      triggered: true,
      actor: INTERNAL_AUTOMATION_ACTOR,
      ai_model_ids,
      prompt_count: prompt_set.prompt_count,
      metadata_json: {
        source: "core_automation",
        trigger: "initial_baseline_after_onboarding",
      },
    };
  }

  async prepare_automatic_daily_tracking_run(project_id: string): Promise<
    | {
        triggered: true;
        actor: typeof INTERNAL_AUTOMATION_ACTOR;
        ai_model_ids: string[];
        prompt_count: number;
      }
    | {
        triggered: false;
        response: AutomaticDailyTrackingRunResult;
      }
  > {
    const project = await this.project_service.assert_project_access(INTERNAL_AUTOMATION_ACTOR, project_id);
    const { organization } = await this.project_service.assert_organization_access(
      INTERNAL_AUTOMATION_ACTOR,
      project.organization_id,
    );
    this.entitlement_service.assert_compute_access(organization, "run_launch");

    const prompt_set = await this.prompt_library_client.get_prompt_set(project_id, "daily_tracking", {
      limit: this.entitlement_service.get_daily_tracking_prompt_limit(organization),
    });

    if (prompt_set.prompt_ids.length === 0) {
      throw new ValidationError("No prompts are available for daily tracking");
    }

    const selected_ai_models = await this.prompt_runner_client.list_ai_models({
      is_active: true,
      limit: organization.tracked_model_limit,
    });
    const ai_model_ids = selected_ai_models
      .slice(0, organization.tracked_model_limit)
      .map((model) => model.id);

    if (ai_model_ids.length === 0) {
      return {
        triggered: false,
        response: {
          project_id,
          triggered: false,
          reason: "no_active_ai_models",
          run_batch_id: null,
          run_status: null,
          ai_model_ids: [],
          prompt_count: prompt_set.prompt_count,
        },
      };
    }

    return {
      triggered: true,
      actor: INTERNAL_AUTOMATION_ACTOR,
      ai_model_ids,
      prompt_count: prompt_set.prompt_count,
    };
  }

  async trigger_refresh_crawl_automatically(project_id: string) {
    const project = await this.project_service.assert_project_access(INTERNAL_AUTOMATION_ACTOR, project_id);
    const { organization } = await this.project_service.assert_organization_access(
      INTERNAL_AUTOMATION_ACTOR,
      project.organization_id,
    );
    this.entitlement_service.assert_compute_access(organization, "crawl_trigger");

    return this.source_intelligence_client.create_crawl_runs(project_id, {
      target_scope: "client",
      scope_type: "incremental",
      trigger_type: "refresh",
    });
  }

  async get_project_overview(user: AccessActor, project_id: string) {
    return this.dashboard_service.get_project_overview(user, project_id);
  }

  async bootstrap_project_competitors(user: AccessActor, project_id: string) {
    await this.project_service.assert_project_access(user, project_id);

    return {
      warnings: await this.bootstrap_competitor_crawls(project_id),
    };
  }

  async prefill_project_competitors(
    user: AccessActor,
    project_id: string,
  ): Promise<PrefillProjectCompetitorsResult> {
    const project = await this.project_service.assert_project_access(user, project_id);
    const { organization } = await this.project_service.assert_organization_access(
      user,
      project.organization_id,
    );
    this.entitlement_service.assert_compute_access(organization, "project_setup");
    const existingCompetitors = await this.project_service.list_competitors(user, project_id);

    if (existingCompetitors.length > 0) {
      return {
        source: "existing",
        competitors: existingCompetitors,
        warnings: [],
      };
    }

    const suggestedCompetitors = await this.prompt_runner_client.generate_competitor_suggestions(
      project_id,
      {
        company_name: project.company_name,
        company_category: project.primary_category,
        company_website: build_website_url(project.domain),
        company_region: project.target_region,
        company_language: project.target_language,
      },
    );

    const inputs = normalize_suggested_competitors(project.domain, suggestedCompetitors);

    if (inputs.length === 0) {
      throw new ValidationError("No usable onboarding competitors were generated");
    }

    const competitors = await this.project_service.create_competitors(user, project_id, inputs);
    const warnings =
      project.status === "active" ? await this.bootstrap_competitor_crawls(project_id) : [];

    return {
      source: "generated",
      competitors,
      warnings,
    };
  }

  private async launch_run(
    user: AccessActor,
    project_id: string,
    run_type: RunType,
    ai_model_ids: string[],
    metadata_json?: Record<string, unknown>,
  ): Promise<LaunchRunResult> {
    const project = await this.project_service.assert_project_access(user, project_id);
    const { organization } = await this.project_service.assert_organization_access(
      user,
      project.organization_id,
    );
    this.entitlement_service.assert_compute_access(organization, "run_launch");
    this.entitlement_service.assert_tracked_model_limit(organization, ai_model_ids.length);

    const prompt_set = await this.prompt_library_client.get_prompt_set(
      project_id,
      run_type,
      run_type === "daily_tracking"
        ? {
            limit: this.entitlement_service.get_daily_tracking_prompt_limit(organization),
          }
        : undefined,
    );

    if (prompt_set.prompt_ids.length === 0) {
      throw new ValidationError("No prompts are available for this run type");
    }

    const reserved_period_keys: Partial<Record<"tracked_prompts_daily" | "llm_responses", string>> = {};
    let tracked_prompts_reserved = 0;
    let llm_responses_reserved = 0;

    try {
      if (run_type === "daily_tracking") {
        const tracking_counter = await this.entitlement_service.consume_metered_quota(
          organization,
          "tracked_prompts_daily",
          prompt_set.prompt_ids.length,
        );
        reserved_period_keys.tracked_prompts_daily = tracking_counter.period.period_key;
        tracked_prompts_reserved = prompt_set.prompt_ids.length;
      }

      const projected_response_count = prompt_set.prompt_ids.length * ai_model_ids.length;
      const response_counter = await this.entitlement_service.consume_metered_quota(
        organization,
        "llm_responses",
        projected_response_count,
      );
      reserved_period_keys.llm_responses = response_counter.period.period_key;
      llm_responses_reserved = projected_response_count;
    } catch (error) {
      if (reserved_period_keys.tracked_prompts_daily && tracked_prompts_reserved > 0) {
        await this.entitlement_service.release_metered_quota(
          organization,
          "tracked_prompts_daily",
          tracked_prompts_reserved,
          reserved_period_keys.tracked_prompts_daily,
        );
      }

      throw error;
    }

    try {
      const project_prompts = await this.prompt_library_client.list_project_prompts(project_id, {
        is_active: true,
      });
      const prompts_by_id = new Map(project_prompts.map((prompt) => [prompt.id, prompt]));
      const selected_prompts = prompt_set.prompt_ids.map((prompt_id) => {
        const prompt = prompts_by_id.get(prompt_id);

        if (!prompt?.body) {
          throw new ValidationError(`Prompt ${prompt_id} is not available for execution`);
        }

        return prompt;
      });
      const synced_prompts = await this.prompt_runner_client.sync_project_prompts(
        project_id,
        selected_prompts,
      );
      const runner_prompt_ids = prompt_set.prompt_ids.map((prompt_id) => {
        const synced_prompt = synced_prompts.find((entry) => entry.source_prompt_id === prompt_id);

        if (!synced_prompt) {
          throw new ValidationError(`Prompt ${prompt_id} could not be synchronized to the runner`);
        }

        return synced_prompt.runner_prompt_id;
      });

      const run_batch = await this.prompt_runner_client.create_run_batch(
        project_id,
        run_type,
        runner_prompt_ids,
        ai_model_ids,
        metadata_json,
      );

      return {
        prompt_set,
        run_batch,
      };
    } catch (error) {
      if (reserved_period_keys.llm_responses && llm_responses_reserved > 0) {
        await this.entitlement_service.release_metered_quota(
          organization,
          "llm_responses",
          llm_responses_reserved,
          reserved_period_keys.llm_responses,
        );
      }

      if (reserved_period_keys.tracked_prompts_daily && tracked_prompts_reserved > 0) {
        await this.entitlement_service.release_metered_quota(
          organization,
          "tracked_prompts_daily",
          tracked_prompts_reserved,
          reserved_period_keys.tracked_prompts_daily,
        );
      }

      throw error;
    }
  }

  private async bootstrap_source_intelligence(project_id: string): Promise<SetupProjectResult["warnings"]> {
    return this.bootstrap_source_intelligence_targets(project_id, "all");
  }

  private async bootstrap_competitor_crawls(project_id: string): Promise<SetupProjectResult["warnings"]> {
    return this.bootstrap_source_intelligence_targets(project_id, "competitors");
  }

  private async bootstrap_source_intelligence_targets(
    project_id: string,
    target_scope: "all" | "competitors",
  ): Promise<SetupProjectResult["warnings"]> {
    const warnings: SetupProjectResult["warnings"] = [];

    try {
      await this.source_intelligence_client.bootstrap_crawl_targets(project_id);
    } catch (error) {
      warnings.push(
        to_service_warning(
          "source_intelligence",
          error,
          "source_intelligence_bootstrap_failed",
          "Project created but crawl target bootstrap failed",
        ),
      );

      return warnings;
    }

    try {
      await this.source_intelligence_client.create_crawl_runs(project_id, {
        target_scope,
        scope_type: "full",
        trigger_type: "project_setup",
      });
    } catch (error) {
      warnings.push(
        to_service_warning(
          "source_intelligence",
          error,
          "source_intelligence_initial_crawl_failed",
          "Project created but initial crawl enqueue failed",
        ),
      );
    }

    return warnings;
  }
}

function normalize_domain(value: string): string | null {
  const trimmed = value.trim().toLowerCase();

  if (!trimmed) {
    return null;
  }

  const candidate = /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    const hostname = url.hostname.replace(/^www\./, "");

    if (!hostname || !hostname.includes(".")) {
      return null;
    }

    return hostname;
  } catch {
    return null;
  }
}

function build_website_url(domain: string): string {
  return `https://${domain}`;
}

function normalize_suggested_competitors(
  company_domain: string,
  suggestions: PromptRunnerCompetitorSuggestion[],
): CreateCompetitorInput[] {
  const normalizedCompanyDomain = normalize_domain(company_domain);
  const seen = new Set<string>();

  return suggestions
    .map((suggestion) => {
      const competitor_name = suggestion.name.trim();
      const competitor_domain = normalize_domain(suggestion.website);

      if (
        !competitor_name ||
        !competitor_domain ||
        competitor_domain === normalizedCompanyDomain ||
        seen.has(competitor_domain)
      ) {
        return null;
      }

      seen.add(competitor_domain);

      return {
        competitor_name,
        competitor_domain,
      };
    })
    .filter((competitor): competitor is CreateCompetitorInput => Boolean(competitor))
    .slice(0, 3);
}

function build_prompt_generation_payload(
  project: Project,
  competitors: ProjectCompetitor[],
  payload: PromptGenerationPayload = {},
): PromptGenerationPayload {
  return {
    category: payload.category ?? project.primary_category,
    competitors:
      payload.competitors ??
      competitors.map((competitor) => competitor.competitor_name),
    personas: payload.personas,
    use_cases: payload.use_cases,
    features: payload.features,
    integrations: payload.integrations,
    industries: payload.industries,
    comparison_topics: payload.comparison_topics,
    faq_questions: payload.faq_questions,
    region: payload.region ?? project.target_region,
    language: payload.language ?? project.target_language,
    metadata_json: payload.metadata_json,
  };
}
