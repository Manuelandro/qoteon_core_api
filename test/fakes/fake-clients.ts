import {
  ExecutionRecord,
  ListExecutionsFilters,
  ListRunBatchesFilters,
  PromptGenerationPayload,
  PromptGenerationResult,
  PromptListFilters,
  PromptRecord,
  PromptSet,
  RunBatch,
  RunProgress,
  RunType,
} from "../../src/domain/core";
import { NotFoundError } from "../../src/errors/app-error";
import { PromptLibraryClient } from "../../src/clients/prompt-library-client";
import { PromptRunnerClient } from "../../src/clients/prompt-runner-client";

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
    const generated_count = payload.prompt_count ?? 3;
    const prompts = [...existing];

    for (let index = 0; index < generated_count; index += 1) {
      prompts.push({
        id: `prompt-${++this.prompt_counter}`,
        project_id,
        title: `Prompt ${this.prompt_counter}`,
        status: "ready",
        is_active: true,
        cluster: payload.seed_topics?.[index] ?? "brand",
        intent: payload.intents?.[0] ?? "awareness",
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

  async get_prompt_set(project_id: string, run_type: RunType): Promise<PromptSet> {
    if (this.fail_get_prompt_set) {
      throw this.fail_get_prompt_set;
    }

    const prompt_set = this.prompt_sets.get(this.prompt_set_key(project_id, run_type));

    if (!prompt_set) {
      throw new NotFoundError("Prompt set not found");
    }

    return prompt_set;
  }

  async activate_prompt(project_id: string, prompt_id: string): Promise<PromptRecord> {
    return this.update_prompt(project_id, prompt_id, true);
  }

  async deactivate_prompt(project_id: string, prompt_id: string): Promise<PromptRecord> {
    return this.update_prompt(project_id, prompt_id, false);
  }

  set_prompts(project_id: string, prompts: PromptRecord[]): void {
    this.prompts_by_project.set(project_id, prompts);
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

  private update_prompt(project_id: string, prompt_id: string, is_active: boolean): PromptRecord {
    const prompts = this.prompts_by_project.get(project_id) ?? [];
    const prompt = prompts.find((entry) => entry.id === prompt_id);

    if (!prompt) {
      throw new NotFoundError("Prompt not found");
    }

    prompt.is_active = is_active;
    this.refresh_prompt_sets(project_id);
    return prompt;
  }

  private refresh_prompt_sets(project_id: string): void {
    const active_prompt_ids = (this.prompts_by_project.get(project_id) ?? [])
      .filter((prompt) => prompt.is_active)
      .map((prompt) => prompt.id);

    for (const run_type of ["baseline", "monthly_tracking"] as const) {
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

export class FakePromptRunnerClient implements PromptRunnerClient {
  readonly run_batches = new Map<string, RunBatch>();
  readonly run_progress = new Map<string, RunProgress>();
  readonly executions_by_batch = new Map<string, ExecutionRecord[]>();
  fail_create_run_batch: Error | null = null;
  fail_list_run_batches: Error | null = null;
  fail_get_run_progress: Error | null = null;
  private run_batch_counter = 0;
  private execution_counter = 0;

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

    const run_batch_id = `run-${++this.run_batch_counter}`;
    const execution_count = prompt_ids.length * ai_model_ids.length;
    const created_at = new Date().toISOString();
    const run_batch: RunBatch = {
      id: run_batch_id,
      project_id,
      run_type,
      status: "queued",
      prompt_ids,
      ai_model_ids,
      execution_count,
      created_at,
      started_at: created_at,
      completed_at: null,
      metadata_json: metadata_json ?? null,
    };

    const executions: ExecutionRecord[] = [];

    for (const prompt_id of prompt_ids) {
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
