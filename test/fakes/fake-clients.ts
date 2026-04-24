import {
  DashboardBaseFilters,
  DashboardClusterBreakdown,
  DashboardClustersFilters,
  DashboardCompetitorBreakdown,
  DashboardCompetitorsFilters,
  DashboardModelBreakdown,
  DashboardModelsFilters,
  DashboardPromptEvidenceFilters,
  DashboardPromptEvidenceResponse,
  DashboardPromptBreakdown,
  DashboardPromptsFilters,
  DashboardProjectCard,
  DashboardProjectOverview,
  DashboardProjectsFilters,
  DashboardRunResults,
  DashboardTrends,
  DashboardTrendsFilters,
  DashboardVisibilitySummary,
  ExecutionRecord,
  ListExecutionsFilters,
  ListRunBatchesFilters,
  PromptGenerationPayload,
  PromptGenerationResult,
  PromptLibraryItem,
  PromptRunnerAiModel,
  PromptRunnerCompetitorSuggestion,
  PromptListFilters,
  PromptRecord,
  PromptSyncRecord,
  SourceIntelligenceCrawlRequest,
  SourceIntelligenceCrawlRun,
  SourceIntelligenceCrawlTarget,
  SourceIntelligencePromptContext,
  PromptSet,
  RunBatch,
  RunProgress,
  RunType,
} from "../../src/domain/core";
import { DashboardLayerClient } from "../../src/clients/dashboard-layer-client";
import { DailyRunnerClient, DailyRunnerWorkflowEvent, DailyRunnerWorkflowRun } from "../../src/clients/daily-runner-client";
import { NotFoundError } from "../../src/errors/app-error";
import { AccessActor, resolve_access_actor } from "../../src/lib/access-actor";
import { PromptLibraryClient } from "../../src/clients/prompt-library-client";
import { PromptRunnerClient } from "../../src/clients/prompt-runner-client";
import {
  ReconcilerAdminProjectDetail,
  ReconcilerAdminProjectListItem,
  ReconcilerClient,
} from "../../src/clients/reconciler-client";
import { SourceIntelligenceClient } from "../../src/clients/source-intelligence-client";

const ACTIVE_TRACKED_PROMPT_COUNT = 5;
const TARGET_PROJECT_PROMPT_LIBRARY_COUNT = 150;

export class FakePromptLibraryClient implements PromptLibraryClient {
  readonly prompts_by_project = new Map<string, PromptRecord[]>();
  readonly prompt_sets = new Map<string, PromptSet>();
  fail_generate: Error | null = null;
  fail_list: Error | null = null;
  fail_get_prompt_set: Error | null = null;
  private prompt_counter = 0;

  async generate_project_prompts(
    project_id: string,
    payload: PromptGenerationPayload,
  ): Promise<PromptGenerationResult> {
    if (this.fail_generate) {
      throw this.fail_generate;
    }

    const existing = this.prompts_by_project.get(project_id) ?? [];
    const generated_count = TARGET_PROJECT_PROMPT_LIBRARY_COUNT;
    const prompts = [...existing];

    for (let index = 0; index < generated_count; index += 1) {
      prompts.push({
        id: `prompt-${++this.prompt_counter}`,
        project_id,
        title: `Prompt ${this.prompt_counter}`,
        body: `Prompt body ${this.prompt_counter}`,
        status: "ready",
        is_active: index < ACTIVE_TRACKED_PROMPT_COUNT,
        cluster: `llm_generated_${index + 1}`,
        intent: "commercial_discovery",
        metadata_json: payload.metadata_json ?? null,
      });
    }

    this.prompts_by_project.set(project_id, prompts);
    this.refresh_prompt_sets(project_id);

    return {
      project_id,
      generated_count,
      total_prompts: prompts.length,
      active_prompts: prompts.filter((prompt) => prompt.is_active).length,
      prompt_ids: prompts.slice(-generated_count).map((prompt) => prompt.id),
    };
  }

  async list_project_prompts(
    project_id: string,
    filters?: PromptListFilters,
  ): Promise<PromptRecord[]> {
    if (this.fail_list) {
      throw this.fail_list;
    }

    return (this.prompts_by_project.get(project_id) ?? []).filter((prompt) => {
      if (filters?.status && prompt.status !== filters.status) {
        return false;
      }

      if (filters?.is_active !== undefined && prompt.is_active !== filters.is_active) {
        return false;
      }

      return true;
    });
  }

  async get_prompt_set(
    project_id: string,
    run_type: RunType,
    filters?: { limit?: number },
  ): Promise<PromptSet> {
    if (this.fail_get_prompt_set) {
      throw this.fail_get_prompt_set;
    }

    const prompt_set = this.prompt_sets.get(this.prompt_set_key(project_id, run_type));

    if (!prompt_set) {
      throw new NotFoundError("Prompt set not found");
    }

    if (filters?.limit === undefined || prompt_set.prompt_ids.length <= filters.limit) {
      return prompt_set;
    }

    return {
      ...prompt_set,
      prompt_ids: prompt_set.prompt_ids.slice(0, filters.limit),
      prompt_count: Math.min(prompt_set.prompt_count, filters.limit),
      active_prompt_count: Math.min(prompt_set.active_prompt_count, filters.limit),
    };
  }

  async activate_prompt(project_id: string, prompt_id: string): Promise<PromptRecord> {
    return this.update_prompt_activation(project_id, prompt_id, true);
  }

  async deactivate_prompt(project_id: string, prompt_id: string): Promise<PromptRecord> {
    return this.update_prompt_activation(project_id, prompt_id, false);
  }

  async update_prompt(project_id: string, prompt_id: string, prompt_text: string): Promise<PromptRecord> {
    const prompt = this.find_prompt(project_id, prompt_id);
    prompt.body = prompt_text.trim();
    prompt.title = prompt.body.slice(0, 80);
    prompt.updated_at = new Date().toISOString();
    return prompt;
  }

  async delete_prompt(project_id: string, prompt_id: string): Promise<PromptRecord> {
    const prompt = this.find_prompt(project_id, prompt_id);
    prompt.is_active = false;
    prompt.status = "archived";
    prompt.archived_at = new Date().toISOString();
    this.refresh_prompt_sets(project_id);
    return prompt;
  }

  async list_prompt_library(
    project_id: string,
    filters?: { search?: string; limit?: number },
  ): Promise<PromptLibraryItem[]> {
    let items = (this.prompts_by_project.get(project_id) ?? [])
      .filter((prompt) => prompt.status !== "archived")
      .map((prompt) => ({
        id: prompt.id,
        prompt_text: prompt.body ?? prompt.title,
        cluster_name: prompt.cluster ?? "unclustered",
        intent_type: prompt.intent ?? "commercial_discovery",
        language: "en",
        region: null,
        source_type: "llm_generated",
        is_active: true,
        metadata_json: prompt.metadata_json ?? null,
        imported_project_prompt_id: prompt.is_active ? prompt.id : null,
        is_imported: prompt.is_active,
        created_at: prompt.created_at,
        updated_at: prompt.updated_at,
      }));

    if (filters?.search) {
      const query = filters.search.toLowerCase();
      items = items.filter(
        (item) =>
          item.prompt_text.toLowerCase().includes(query) ||
          item.cluster_name.toLowerCase().includes(query) ||
          item.intent_type.toLowerCase().includes(query),
      );
    }

    if (filters?.limit) {
      items = items.slice(0, filters.limit);
    }

    return items;
  }

  async import_prompt_library_item(project_id: string, prompt_id: string): Promise<PromptRecord> {
    const prompt = this.find_prompt(project_id, prompt_id);
    prompt.is_active = true;
    prompt.updated_at = new Date().toISOString();
    this.refresh_prompt_sets(project_id);
    return prompt;
  }

  set_prompts(project_id: string, prompts: PromptRecord[]): void {
    this.prompts_by_project.set(
      project_id,
      prompts.map((prompt) => ({
        ...prompt,
        body: prompt.body ?? prompt.title,
      })),
    );
    this.refresh_prompt_sets(project_id);
  }

  set_prompt_library_items(project_id: string, items: PromptLibraryItem[]): void {
    const existingPrompts = this.prompts_by_project.get(project_id) ?? [];
    const seededPrompts = items.map((item) => ({
      id: item.id,
      project_id,
      title: item.prompt_text.slice(0, 80),
      body: item.prompt_text,
      status: "ready",
      is_active: item.is_imported,
      cluster: item.cluster_name,
      intent: item.intent_type,
      metadata_json: item.metadata_json ?? null,
      created_at: item.created_at,
      updated_at: item.updated_at,
    }));
    this.prompts_by_project.set(project_id, [...existingPrompts, ...seededPrompts]);
    this.refresh_prompt_sets(project_id);
  }

  set_prompt_set(project_id: string, run_type: RunType, prompt_ids: string[]): void {
    this.prompt_sets.set(this.prompt_set_key(project_id, run_type), {
      project_id,
      run_type,
      prompt_ids,
      prompt_count: prompt_ids.length,
      active_prompt_count: prompt_ids.length,
    });
  }

  private update_prompt_activation(
    project_id: string,
    prompt_id: string,
    is_active: boolean,
  ): PromptRecord {
    const prompt = this.find_prompt(project_id, prompt_id);
    prompt.is_active = is_active;
    this.refresh_prompt_sets(project_id);
    return prompt;
  }

  private find_prompt(project_id: string, prompt_id: string): PromptRecord {
    const prompts = this.prompts_by_project.get(project_id) ?? [];
    const prompt = prompts.find((entry) => entry.id === prompt_id);

    if (!prompt) {
      throw new NotFoundError("Prompt not found");
    }

    return prompt;
  }

  private refresh_prompt_sets(project_id: string): void {
    const active_prompt_ids = (this.prompts_by_project.get(project_id) ?? [])
      .filter((prompt) => prompt.is_active)
      .map((prompt) => prompt.id);

    for (const run_type of ["baseline", "daily_tracking"] as const) {
      this.prompt_sets.set(this.prompt_set_key(project_id, run_type), {
        project_id,
        run_type,
        prompt_ids: active_prompt_ids,
        prompt_count: active_prompt_ids.length,
        active_prompt_count: active_prompt_ids.length,
      });
    }
  }

  private prompt_set_key(project_id: string, run_type: RunType): string {
    return `${project_id}:${run_type}`;
  }
}

export class FakeDailyRunnerClient implements DailyRunnerClient {
  list_response: { projects: unknown[] } = { projects: [] };
  project_response: unknown = null;
  workflow_runs_response: { workflow_runs: unknown[] } = { workflow_runs: [] };
  latest_workflow_response: { workflow_run: DailyRunnerWorkflowRun | null; recent_events: DailyRunnerWorkflowEvent[] } =
    { workflow_run: null, recent_events: [] };
  workflow_response: unknown = { workflow_run: null };
  workflow_events_response: { events: DailyRunnerWorkflowEvent[] } = { events: [] };
  actions: Array<{ action: string; project_id: string; payload?: Record<string, unknown> }> = [];

  async list_projects() {
    return this.list_response;
  }

  async get_project(project_id: string) {
    this.actions.push({
      action: "get_project",
      project_id,
    });
    return this.project_response;
  }

  async list_project_workflow_runs(project_id: string) {
    this.actions.push({
      action: "list_project_workflow_runs",
      project_id,
    });
    return this.workflow_runs_response;
  }

  async get_latest_project_workflow(project_id: string) {
    this.actions.push({
      action: "get_latest_project_workflow",
      project_id,
    });
    return this.latest_workflow_response;
  }

  async get_workflow(workflow_run_id: string) {
    this.actions.push({
      action: "get_workflow",
      project_id: workflow_run_id,
    });
    return this.workflow_response;
  }

  async list_workflow_events(workflow_run_id: string) {
    this.actions.push({
      action: "list_workflow_events",
      project_id: workflow_run_id,
    });
    return this.workflow_events_response;
  }

  async run_now(project_id: string) {
    this.actions.push({
      action: "run_now",
      project_id,
    });
    return { ok: true };
  }

  async pause(project_id: string, reason?: string) {
    this.actions.push({
      action: "pause",
      project_id,
      payload: reason ? { reason } : {},
    });
    return { ok: true };
  }

  async resume(project_id: string) {
    this.actions.push({
      action: "resume",
      project_id,
    });
    return { ok: true };
  }

  async update_schedule(project_id: string, payload: Record<string, unknown>) {
    this.actions.push({
      action: "update_schedule",
      project_id,
      payload,
    });
    return { ok: true };
  }

  async restart_workflow(project_id: string) {
    this.actions.push({
      action: "restart_workflow",
      project_id,
    });
    return { ok: true };
  }

  async retry_workflow_step(workflow_run_id: string, source?: string) {
    this.actions.push({
      action: "retry_workflow_step",
      project_id: workflow_run_id,
      payload: source ? { source } : {},
    });
    return { ok: true };
  }

  async restart_workflow_run(workflow_run_id: string, source?: string) {
    this.actions.push({
      action: "restart_workflow_run",
      project_id: workflow_run_id,
      payload: source ? { source } : {},
    });
    return { ok: true };
  }
}

export class FakePromptRunnerClient implements PromptRunnerClient {
  readonly run_batches = new Map<string, RunBatch>();
  readonly run_progress = new Map<string, RunProgress>();
  readonly executions_by_batch = new Map<string, ExecutionRecord[]>();
  readonly synced_prompts = new Map<string, string>();
  readonly source_prompts_by_runner_id = new Map<string, string>();
  readonly ai_models: PromptRunnerAiModel[] = [
    {
      id: "gpt-5.4",
      provider_name: "openai",
      model_name: "gpt-5.4",
      api_mode: "responses",
      is_active: true,
      timeout_seconds: 60,
      max_retries: 2,
      rate_limit_group: "openai-default",
    },
    {
      id: "claude-sonnet",
      provider_name: "anthropic",
      model_name: "claude-sonnet-4-5",
      api_mode: "messages",
      is_active: true,
      timeout_seconds: 60,
      max_retries: 2,
      rate_limit_group: "anthropic-default",
    },
    {
      id: "gemini-2.5-pro",
      provider_name: "google",
      model_name: "gemini-2.5-pro",
      api_mode: "generate_content",
      is_active: true,
      timeout_seconds: 60,
      max_retries: 2,
      rate_limit_group: "google-default",
    },
    {
      id: "grok-4",
      provider_name: "xai",
      model_name: "grok-4",
      api_mode: "responses",
      is_active: true,
      timeout_seconds: 60,
      max_retries: 2,
      rate_limit_group: "xai-default",
    },
  ];
  generated_competitor_suggestions = new Map<string, PromptRunnerCompetitorSuggestion[]>();
  fail_create_run_batch: Error | null = null;
  fail_generate_competitor_suggestions: Error | null = null;
  fail_list_run_batches: Error | null = null;
  fail_get_run_progress: Error | null = null;
  create_run_batch_delay_ms = 0;
  last_generate_competitor_suggestions_request:
    | {
        project_id: string;
        company_name: string;
        company_category: string;
        company_website: string;
        company_region: string[];
        company_language: string;
      }
    | null = null;
  private run_batch_counter = 0;
  private execution_counter = 0;

  async generate_competitor_suggestions(
    project_id: string,
    input: {
      company_name: string;
      company_category: string;
      company_website: string;
      company_region: string[];
      company_language: string;
    },
  ): Promise<PromptRunnerCompetitorSuggestion[]> {
    this.last_generate_competitor_suggestions_request = {
      project_id,
      ...input,
    };

    if (this.fail_generate_competitor_suggestions) {
      throw this.fail_generate_competitor_suggestions;
    }

    return (
      this.generated_competitor_suggestions.get(project_id) ?? [
        {
          name: "Competitor One",
          website: "https://competitor-one.example",
          icon: "https://www.google.com/s2/favicons?domain=competitor-one.example&sz=64",
        },
        {
          name: "Competitor Two",
          website: "https://competitor-two.example",
          icon: "https://www.google.com/s2/favicons?domain=competitor-two.example&sz=64",
        },
        {
          name: "Competitor Three",
          website: "https://competitor-three.example",
          icon: "https://www.google.com/s2/favicons?domain=competitor-three.example&sz=64",
        },
      ]
    );
  }

  async sync_project_prompts(
    project_id: string,
    prompts: PromptRecord[],
  ): Promise<PromptSyncRecord[]> {
    return prompts.map((prompt) => {
      const runner_prompt_id = `runner-${project_id}-${prompt.id}`;
      this.synced_prompts.set(prompt.id, runner_prompt_id);
      this.source_prompts_by_runner_id.set(runner_prompt_id, prompt.id);

      return {
        source_prompt_id: prompt.id,
        runner_prompt_id,
      };
    });
  }

  async create_run_batch(
    project_id: string,
    run_type: RunType,
    prompt_ids: string[],
    ai_model_ids: string[],
    metadata_json?: Record<string, unknown>,
  ): Promise<RunBatch> {
    if (this.fail_create_run_batch) {
      throw this.fail_create_run_batch;
    }

    if (this.create_run_batch_delay_ms > 0) {
      await sleep(this.create_run_batch_delay_ms);
    }

    const run_batch_id = `run-${++this.run_batch_counter}`;
    const source_prompt_ids = prompt_ids.map(
      (prompt_id) => this.source_prompts_by_runner_id.get(prompt_id) ?? prompt_id,
    );
    const execution_count = prompt_ids.length * ai_model_ids.length;
    const created_at = new Date().toISOString();
    const run_batch: RunBatch = {
      id: run_batch_id,
      project_id,
      run_type,
      status: "queued",
      prompt_ids: source_prompt_ids,
      ai_model_ids,
      execution_count,
      created_at,
      started_at: created_at,
      completed_at: null,
      metadata_json: metadata_json ?? null,
    };

    const executions: ExecutionRecord[] = [];

    for (const prompt_id of source_prompt_ids) {
      for (const ai_model_id of ai_model_ids) {
        executions.push({
          id: `execution-${++this.execution_counter}`,
          run_batch_id,
          project_id,
          prompt_id,
          ai_model_id,
          status: "queued",
          provider: null,
          started_at: null,
          completed_at: null,
          error_message: null,
        });
      }
    }

    this.run_batches.set(run_batch.id, run_batch);
    this.executions_by_batch.set(run_batch.id, executions);
    this.run_progress.set(run_batch.id, {
      run_batch_id: run_batch.id,
      status: "queued",
      total_executions: execution_count,
      queued_executions: execution_count,
      running_executions: 0,
      completed_executions: 0,
      failed_executions: 0,
      progress_percent: 0,
      updated_at: created_at,
    });

    return run_batch;
  }

  async list_ai_models(filters?: { is_active?: boolean; limit?: number }): Promise<PromptRunnerAiModel[]> {
    const models = this.ai_models.filter((model) =>
      filters?.is_active === undefined ? true : model.is_active === filters.is_active,
    );

    return typeof filters?.limit === "number" ? models.slice(0, filters.limit) : models;
  }

  async get_run_batch(run_batch_id: string): Promise<RunBatch> {
    const run_batch = this.run_batches.get(run_batch_id);

    if (!run_batch) {
      throw new NotFoundError("Run batch not found");
    }

    return run_batch;
  }

  async list_run_batches(
    project_id: string,
    filters?: ListRunBatchesFilters,
  ): Promise<RunBatch[]> {
    if (this.fail_list_run_batches) {
      throw this.fail_list_run_batches;
    }

    const batches = [...this.run_batches.values()].filter((run_batch) => {
      if (run_batch.project_id !== project_id) {
        return false;
      }

      if (filters?.status && run_batch.status !== filters.status) {
        return false;
      }

      if (filters?.run_type && run_batch.run_type !== filters.run_type) {
        return false;
      }

      return true;
    });

    return typeof filters?.limit === "number" ? batches.slice(0, filters.limit) : batches;
  }

  async get_run_progress(run_batch_id: string): Promise<RunProgress> {
    if (this.fail_get_run_progress) {
      throw this.fail_get_run_progress;
    }

    const progress = this.run_progress.get(run_batch_id);

    if (!progress) {
      throw new NotFoundError("Run progress not found");
    }

    return progress;
  }

  async list_executions(
    run_batch_id: string,
    filters?: ListExecutionsFilters,
  ): Promise<ExecutionRecord[]> {
    const executions = this.executions_by_batch.get(run_batch_id) ?? [];

    return executions.filter((execution) => {
      if (filters?.status && execution.status !== filters.status) {
        return false;
      }

      return true;
    });
  }

  async retry_execution(execution_id: string): Promise<ExecutionRecord> {
    for (const executions of this.executions_by_batch.values()) {
      const execution = executions.find((entry) => entry.id === execution_id);

      if (!execution) {
        continue;
      }

      execution.status = "queued";
      execution.error_message = null;
      execution.started_at = null;
      execution.completed_at = null;
      return execution;
    }

    throw new NotFoundError("Execution not found");
  }

  set_run_progress(run_batch_id: string, progress: RunProgress): void {
    this.run_progress.set(run_batch_id, progress);
  }
}

export class FakeReconcilerClient implements ReconcilerClient {
  list_response: { projects: ReconcilerAdminProjectListItem[] } = { projects: [] };
  detail_response: ReconcilerAdminProjectDetail = {
    project: {
      projectId: "project-1",
      organizationId: "org-1",
      organizationName: "Acme",
      projectName: "Acme Project",
      domain: "acme.com",
      companyName: "Acme",
      primaryCategory: "SaaS",
      targetRegion: ["United States"],
      targetLanguage: "en",
      projectStatus: "active",
      trackedModelLimit: 3,
    },
    reconciliation_state: null,
    diagnostics: {
      baselineRuns: [],
      dashboardSummary: {
        hasData: false,
        runBatchId: null,
      },
    },
    detected_state: "baseline_missing",
    recommended_next_action: "Launch the first baseline run through Core.",
    event_history: [],
  };
  actions: Array<{ action: string; project_id: string; payload?: unknown }> = [];

  async list_projects(): Promise<{ projects: ReconcilerAdminProjectListItem[] }> {
    return this.list_response;
  }

  async get_project(project_id: string): Promise<ReconcilerAdminProjectDetail> {
    this.actions.push({ action: "get_project", project_id });
    return this.detail_response;
  }

  async run_now(project_id: string): Promise<unknown> {
    this.actions.push({ action: "run_now", project_id });
    return { ok: true };
  }

  async retry_crawl(project_id: string): Promise<{ ok: boolean }> {
    this.actions.push({ action: "retry_crawl", project_id });
    return { ok: true };
  }

  async regenerate_prompts(project_id: string): Promise<{ ok: boolean }> {
    this.actions.push({ action: "regenerate_prompts", project_id });
    return { ok: true };
  }

  async launch_baseline(project_id: string): Promise<{ ok: boolean }> {
    this.actions.push({ action: "launch_baseline", project_id });
    return { ok: true };
  }

  async restart_initial_pipeline(project_id: string, force: boolean): Promise<{ ok: boolean }> {
    this.actions.push({ action: "restart_initial_pipeline", project_id, payload: { force } });
    return { ok: true };
  }
}

export class FakeSourceIntelligenceClient implements SourceIntelligenceClient {
  readonly targets_by_project = new Map<string, SourceIntelligenceCrawlTarget[]>();
  readonly crawl_runs_by_project = new Map<string, SourceIntelligenceCrawlRun[]>();
  readonly prompt_context_by_project = new Map<string, SourceIntelligencePromptContext>();
  fail_bootstrap: Error | null = null;
  fail_create_crawl_runs: Error | null = null;
  create_crawl_runs_delay_ms = 0;
  bootstrap_call_count = 0;
  create_crawl_runs_call_count = 0;
  private target_counter = 0;
  private crawl_run_counter = 0;

  async bootstrap_crawl_targets(project_id: string): Promise<{
    project_id: string;
    targets: SourceIntelligenceCrawlTarget[];
  }> {
    this.bootstrap_call_count += 1;

    if (this.fail_bootstrap) {
      throw this.fail_bootstrap;
    }

    const targets = this.targets_by_project.get(project_id) ?? [
      {
        id: `crawl-target-${++this.target_counter}`,
        project_id,
        target_type: "client_site",
        project_competitor_id: null,
        canonical_domain: "acme.com",
        start_url: "https://acme.com",
        is_active: true,
        metadata_json: {},
      },
    ];

    this.targets_by_project.set(project_id, targets);

    return {
      project_id,
      targets,
    };
  }

  async create_crawl_runs(
    project_id: string,
    payload: SourceIntelligenceCrawlRequest & {
      trigger_type?: "project_setup" | "manual" | "scheduled" | "refresh";
    },
  ): Promise<{
    project_id: string;
    crawl_runs: SourceIntelligenceCrawlRun[];
  }> {
    this.create_crawl_runs_call_count += 1;

    if (this.fail_create_crawl_runs) {
      throw this.fail_create_crawl_runs;
    }

    if (this.create_crawl_runs_delay_ms > 0) {
      await sleep(this.create_crawl_runs_delay_ms);
    }

    const crawlRun: SourceIntelligenceCrawlRun = {
      id: `crawl-run-${++this.crawl_run_counter}`,
      crawl_target_id: `crawl-target-${this.crawl_run_counter}`,
      project_id,
      status: "queued",
      trigger_type: payload.trigger_type ?? "manual",
      scope_type: payload.scope_type ?? "full",
      max_pages: payload.max_pages ?? 50,
      max_depth: payload.max_depth ?? 3,
      pages_discovered: 0,
      pages_crawled: 0,
      pages_stored: 0,
      started_at: null,
      completed_at: null,
      metadata_json: payload.single_url ? { single_url: payload.single_url } : {},
    };

    const existing = this.crawl_runs_by_project.get(project_id) ?? [];
    existing.unshift(crawlRun);
    this.crawl_runs_by_project.set(project_id, existing);

    return {
      project_id,
      crawl_runs: [crawlRun],
    };
  }

  async list_crawl_runs(
    project_id: string,
    filters?: { status?: string; limit?: number },
  ): Promise<SourceIntelligenceCrawlRun[]> {
    const runs = (this.crawl_runs_by_project.get(project_id) ?? []).filter((run) => {
      if (filters?.status && run.status !== filters.status) {
        return false;
      }

      return true;
    });

    return typeof filters?.limit === "number" ? runs.slice(0, filters.limit) : runs;
  }

  async get_prompt_context(project_id: string): Promise<SourceIntelligencePromptContext> {
    return (
      this.prompt_context_by_project.get(project_id) ?? {
        project_id,
        last_successful_crawl_at: null,
        is_ready_for_prompt_generation: false,
        prompt_generation_blockers: [
          "no_successful_crawl",
          "no_successful_targets",
          "no_crawled_pages",
        ],
        client_website_crawl_status: "pending",
        client_website_crawl_message: null,
        client_website_crawl_attempts_made: 0,
        client_website_crawl_max_attempts: 5,
        crawl_coverage: {
          active_target_count: 0,
          total_targets: 0,
          completed_run_count: 0,
          successful_target_count: 0,
          total_pages: 0,
          client_pages: 0,
          competitor_pages: 0,
          page_types: {},
        },
        suggested_personas: [],
        suggested_use_cases: [],
        suggested_features: [],
        suggested_integrations: [],
        suggested_industries: [],
        suggested_comparison_topics: [],
        suggested_faq_questions: [],
        competitor_signal_groups: [],
      }
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class FakeDashboardLayerClient implements DashboardLayerClient {
  project_overview_response: DashboardProjectOverview | null = null;
  portfolio_projects_response: DashboardProjectCard[] = [];
  visibility_summary_response: DashboardVisibilitySummary | null = null;
  prompt_breakdown_response: DashboardPromptBreakdown | null = null;
  prompt_evidence_response: DashboardPromptEvidenceResponse | null = null;
  model_breakdown_response: DashboardModelBreakdown | null = null;
  cluster_breakdown_response: DashboardClusterBreakdown | null = null;
  competitor_breakdown_response: DashboardCompetitorBreakdown | null = null;
  trends_response: DashboardTrends | null = null;
  run_results_response: DashboardRunResults | null = null;
  fail_error: Error | null = null;
  last_overview_request: { user_id: string; project_id: string } | null = null;
  last_portfolio_request: { user_id: string; filters?: DashboardProjectsFilters } | null = null;
  last_visibility_request:
    | { user_id: string; project_id: string; filters?: DashboardBaseFilters }
    | null = null;
  last_model_request:
    | { user_id: string; project_id: string; filters?: DashboardModelsFilters }
    | null = null;
  last_prompt_request:
    | {
        user_id: string;
        project_id: string;
        filters?: DashboardPromptsFilters;
      }
    | null = null;
  last_prompt_evidence_request:
    | {
        user_id: string;
        project_id: string;
        prompt_id: string;
        filters: DashboardPromptEvidenceFilters;
      }
    | null = null;
  last_cluster_request:
    | { user_id: string; project_id: string; filters?: DashboardClustersFilters }
    | null = null;
  last_competitor_request:
    | { user_id: string; project_id: string; filters?: DashboardCompetitorsFilters }
    | null = null;
  last_trends_request:
    | { user_id: string; project_id: string; filters?: DashboardTrendsFilters }
    | null = null;
  last_run_results_request: { user_id: string; run_batch_id: string } | null = null;

  async get_project_overview(user: AccessActor, project_id: string): Promise<DashboardProjectOverview> {
    const actor = resolve_access_actor(user);
    this.last_overview_request = { user_id: actor.user_id, project_id };
    this.throw_if_needed();

    if (!this.project_overview_response) {
      throw new NotFoundError("Dashboard overview not found");
    }

    return this.project_overview_response;
  }

  async list_portfolio_projects(
    user: AccessActor,
    filters?: DashboardProjectsFilters,
  ): Promise<DashboardProjectCard[]> {
    const actor = resolve_access_actor(user);
    this.last_portfolio_request = { user_id: actor.user_id, filters };
    this.throw_if_needed();
    return this.portfolio_projects_response;
  }

  async get_visibility_summary(
    user: AccessActor,
    project_id: string,
    filters?: DashboardBaseFilters,
  ): Promise<DashboardVisibilitySummary> {
    const actor = resolve_access_actor(user);
    this.last_visibility_request = { user_id: actor.user_id, project_id, filters };
    this.throw_if_needed();

    if (!this.visibility_summary_response) {
      throw new NotFoundError("Dashboard visibility summary not found");
    }

    return this.visibility_summary_response;
  }

  async get_model_breakdown(
    user: AccessActor,
    project_id: string,
    filters?: DashboardModelsFilters,
  ): Promise<DashboardModelBreakdown> {
    const actor = resolve_access_actor(user);
    this.last_model_request = { user_id: actor.user_id, project_id, filters };
    this.throw_if_needed();

    if (!this.model_breakdown_response) {
      throw new NotFoundError("Dashboard model breakdown not found");
    }

    return this.model_breakdown_response;
  }

  async get_prompt_breakdown(
    user: AccessActor,
    project_id: string,
    filters?: DashboardPromptsFilters,
  ): Promise<DashboardPromptBreakdown> {
    const actor = resolve_access_actor(user);
    this.last_prompt_request = { user_id: actor.user_id, project_id, filters };
    this.throw_if_needed();

    if (!this.prompt_breakdown_response) {
      throw new NotFoundError("Dashboard prompt breakdown not found");
    }

    return this.prompt_breakdown_response;
  }

  async get_prompt_evidence(
    user: AccessActor,
    project_id: string,
    prompt_id: string,
    filters: DashboardPromptEvidenceFilters,
  ): Promise<DashboardPromptEvidenceResponse> {
    const actor = resolve_access_actor(user);
    this.last_prompt_evidence_request = { user_id: actor.user_id, project_id, prompt_id, filters };
    this.throw_if_needed();

    if (!this.prompt_evidence_response) {
      throw new NotFoundError("Dashboard prompt evidence not found");
    }

    return this.prompt_evidence_response;
  }

  async get_cluster_breakdown(
    user: AccessActor,
    project_id: string,
    filters?: DashboardClustersFilters,
  ): Promise<DashboardClusterBreakdown> {
    const actor = resolve_access_actor(user);
    this.last_cluster_request = { user_id: actor.user_id, project_id, filters };
    this.throw_if_needed();

    if (!this.cluster_breakdown_response) {
      throw new NotFoundError("Dashboard cluster breakdown not found");
    }

    return this.cluster_breakdown_response;
  }

  async get_competitor_breakdown(
    user: AccessActor,
    project_id: string,
    filters?: DashboardCompetitorsFilters,
  ): Promise<DashboardCompetitorBreakdown> {
    const actor = resolve_access_actor(user);
    this.last_competitor_request = { user_id: actor.user_id, project_id, filters };
    this.throw_if_needed();

    if (!this.competitor_breakdown_response) {
      throw new NotFoundError("Dashboard competitor breakdown not found");
    }

    return this.competitor_breakdown_response;
  }

  async get_trends(
    user: AccessActor,
    project_id: string,
    filters?: DashboardTrendsFilters,
  ): Promise<DashboardTrends> {
    const actor = resolve_access_actor(user);
    this.last_trends_request = { user_id: actor.user_id, project_id, filters };
    this.throw_if_needed();

    if (!this.trends_response) {
      throw new NotFoundError("Dashboard trends not found");
    }

    return this.trends_response;
  }

  async get_run_results(user: AccessActor, run_batch_id: string): Promise<DashboardRunResults> {
    const actor = resolve_access_actor(user);
    this.last_run_results_request = { user_id: actor.user_id, run_batch_id };
    this.throw_if_needed();

    if (!this.run_results_response) {
      throw new NotFoundError("Dashboard run results not found");
    }

    return this.run_results_response;
  }

  private throw_if_needed(): void {
    if (this.fail_error) {
      throw this.fail_error;
    }
  }
}
