import {
  PromptGenerationPayload,
  PromptGenerationResult,
  PromptListFilters,
  PromptRecord,
  PromptSet,
  RunType,
} from "../domain/core";
import { HttpJsonClient } from "./http-client";
import { PromptLibraryClient } from "./prompt-library-client";

export class HttpPromptLibraryClient implements PromptLibraryClient {
  constructor(private readonly client: HttpJsonClient) {}

  async generate_project_prompts(
    project_id: string,
    payload: PromptGenerationPayload,
  ): Promise<PromptGenerationResult> {
    return this.client.request("POST", `/internal/projects/${project_id}/prompts/generate`, {
      body: payload,
    });
  }

  async list_project_prompts(
    project_id: string,
    filters?: PromptListFilters,
  ): Promise<PromptRecord[]> {
    return this.client.request("GET", `/internal/projects/${project_id}/prompts`, {
      query: filters,
    });
  }

  async get_prompt_set(
    project_id: string,
    run_type: RunType,
    filters?: { limit?: number },
  ): Promise<PromptSet> {
    return this.client.request("GET", `/internal/projects/${project_id}/prompt-sets/${run_type}`, {
      query: filters,
    });
  }

  async activate_prompt(project_id: string, prompt_id: string): Promise<PromptRecord> {
    return this.client.request("POST", `/internal/projects/${project_id}/prompts/${prompt_id}/activate`);
  }

  async deactivate_prompt(project_id: string, prompt_id: string): Promise<PromptRecord> {
    return this.client.request("POST", `/internal/projects/${project_id}/prompts/${prompt_id}/deactivate`);
  }
}
