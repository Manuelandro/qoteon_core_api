import {
  PromptRunnerAiModel,
  ExecutionRecord,
  ListExecutionsFilters,
  ListRunBatchesFilters,
  PromptRunnerCompetitorSuggestion,
  PromptRecord,
  PromptSyncRecord,
  RunBatch,
  RunProgress,
  RunType,
} from "../domain/core";

export interface PromptRunnerClient {
  generate_competitor_suggestions(
    project_id: string,
    input: {
      company_name: string;
      company_category: string;
      company_website: string;
      company_region: string[];
      company_language: string;
    },
  ): Promise<PromptRunnerCompetitorSuggestion[]>;
  sync_project_prompts(
    project_id: string,
    prompts: PromptRecord[],
  ): Promise<PromptSyncRecord[]>;
  create_run_batch(
    project_id: string,
    run_type: RunType,
    prompt_ids: string[],
    ai_model_ids: string[],
    metadata_json?: Record<string, unknown>,
  ): Promise<RunBatch>;
  list_ai_models(filters?: { is_active?: boolean; limit?: number }): Promise<PromptRunnerAiModel[]>;
  get_run_batch(run_batch_id: string): Promise<RunBatch>;
  list_run_batches(
    project_id: string,
    filters?: ListRunBatchesFilters,
  ): Promise<RunBatch[]>;
  get_run_progress(run_batch_id: string): Promise<RunProgress>;
  list_executions(
    run_batch_id: string,
    filters?: ListExecutionsFilters,
  ): Promise<ExecutionRecord[]>;
  retry_execution(execution_id: string): Promise<ExecutionRecord>;
}
