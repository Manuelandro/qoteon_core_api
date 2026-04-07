import {
  ExecutionRecord,
  ListExecutionsFilters,
  ListRunBatchesFilters,
  RunBatch,
  RunProgress,
  RunType,
} from "../domain/core";
import { HttpJsonClient } from "./http-client";
import { PromptRunnerClient } from "./prompt-runner-client";

export class HttpPromptRunnerClient implements PromptRunnerClient {
  constructor(private readonly client: HttpJsonClient) {}

  async create_run_batch(
    project_id: string,
    run_type: RunType,
    prompt_ids: string[],
    ai_model_ids: string[],
    metadata_json?: Record<string, unknown>,
  ): Promise<RunBatch> {
    return this.client.request("POST", `/internal/projects/${project_id}/run-batches`, {
      body: {
        run_type,
        prompt_ids,
        ai_model_ids,
        metadata_json: metadata_json ?? null,
      },
    });
  }

  async get_run_batch(run_batch_id: string): Promise<RunBatch> {
    return this.client.request("GET", `/internal/run-batches/${run_batch_id}`);
  }

  async list_run_batches(
    project_id: string,
    filters?: ListRunBatchesFilters,
  ): Promise<RunBatch[]> {
    return this.client.request("GET", `/internal/projects/${project_id}/run-batches`, {
      query: filters,
    });
  }

  async get_run_progress(run_batch_id: string): Promise<RunProgress> {
    return this.client.request("GET", `/internal/run-batches/${run_batch_id}/progress`);
  }

  async list_executions(
    run_batch_id: string,
    filters?: ListExecutionsFilters,
  ): Promise<ExecutionRecord[]> {
    return this.client.request("GET", `/internal/run-batches/${run_batch_id}/executions`, {
      query: filters,
    });
  }

  async retry_execution(execution_id: string): Promise<ExecutionRecord> {
    return this.client.request("POST", `/internal/executions/${execution_id}/retry`);
  }
}
