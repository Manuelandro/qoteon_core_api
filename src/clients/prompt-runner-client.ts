import {
  ExecutionRecord,
  ListExecutionsFilters,
  ListRunBatchesFilters,
  PromptRecord,
  PromptSyncRecord,
  RunBatch,
  RunProgress,
  RunType,
} from "../domain/core";

export interface PromptRunnerClient {
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
