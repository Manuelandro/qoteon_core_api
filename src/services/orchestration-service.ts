import {
  CreateCompetitorInput,
  CreateProjectInput,
  ExecutionRecord,
  LaunchRunResult,
  ListExecutionsFilters,
  ListRunBatchesFilters,
  Project,
  ProjectCompetitor,
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
import { ProjectService } from "./project-service";

export interface SetupProjectRequest {
  organization_id: string;
  name: string;
  domain: string;
  company_name: string;
  primary_category: string;
  target_region: string;
  target_language: string;
  status?: CreateProjectInput["status"];
  competitors?: CreateCompetitorInput[];
  generate_initial_prompts?: boolean;
  prompt_generation_payload?: PromptGenerationPayload;
}

export class OrchestrationService {
  constructor(
    private readonly project_service: ProjectService,
    private readonly prompt_library_client: PromptLibraryClient,
    private readonly prompt_runner_client: PromptRunnerClient,
    private readonly source_intelligence_client: SourceIntelligenceClient,
    private readonly dashboard_service: DashboardService,
  ) {}

  async setup_project(user: AccessActor, input: SetupProjectRequest): Promise<SetupProjectResult> {
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
    const warnings = await this.bootstrap_source_intelligence(project.id);

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
    await this.project_service.assert_project_access(user, project_id);
    const prompt_set = await this.prompt_library_client.get_prompt_set(project_id, run_type);

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

  async launch_baseline_scan(
    user: AccessActor,
    project_id: string,
    ai_model_ids: string[],
    metadata_json?: Record<string, unknown>,
  ): Promise<LaunchRunResult> {
    return this.launch_run(user, project_id, "baseline", ai_model_ids, metadata_json);
  }

  async launch_monthly_tracking(
    user: AccessActor,
    project_id: string,
    ai_model_ids: string[],
    metadata_json?: Record<string, unknown>,
  ): Promise<LaunchRunResult> {
    return this.launch_run(user, project_id, "monthly_tracking", ai_model_ids, metadata_json);
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
    await this.project_service.assert_project_access(user, project_id);

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

  async get_project_overview(user: AccessActor, project_id: string) {
    return this.dashboard_service.get_project_overview(user, project_id);
  }

  private async launch_run(
    user: AccessActor,
    project_id: string,
    run_type: RunType,
    ai_model_ids: string[],
    metadata_json?: Record<string, unknown>,
  ): Promise<LaunchRunResult> {
    await this.project_service.assert_project_access(user, project_id);

    const prompt_set = await this.prompt_library_client.get_prompt_set(project_id, run_type);

    if (prompt_set.prompt_ids.length === 0) {
      throw new ValidationError("No prompts are available for this run type");
    }

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
  }

  private async bootstrap_source_intelligence(project_id: string): Promise<SetupProjectResult["warnings"]> {
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
        target_scope: "all",
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
