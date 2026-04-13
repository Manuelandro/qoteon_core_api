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
import { HttpJsonClient } from "./http-client";
import { PromptRunnerClient } from "./prompt-runner-client";

export class HttpPromptRunnerClient implements PromptRunnerClient {
  constructor(private readonly client: HttpJsonClient) {}

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
    const response = await this.client.request<{
      competitors: PromptRunnerCompetitorSuggestion[];
    }>("POST", `/internal/projects/${project_id}/competitor-suggestions`, {
      body: input,
    });

    return response.competitors;
  }

  async sync_project_prompts(
    project_id: string,
    prompts: PromptRecord[],
  ): Promise<PromptSyncRecord[]> {
    const response = await this.client.request<{ prompts: PromptSyncRecord[] }>(
      "POST",
      `/internal/projects/${project_id}/prompts/sync`,
      {
        body: {
          prompts: prompts.map((prompt) => ({
            id: prompt.id,
            title: prompt.title,
            body: prompt.body ?? "",
            cluster: prompt.cluster ?? null,
            intent: prompt.intent ?? null,
            is_active: prompt.is_active,
            metadata_json: prompt.metadata_json ?? null,
          })),
        },
      },
    );

    return response.prompts;
  }

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

  async list_ai_models(filters?: { is_active?: boolean; limit?: number }): Promise<PromptRunnerAiModel[]> {
    return this.client.request("GET", "/internal/ai-models", {
      query: filters,
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
