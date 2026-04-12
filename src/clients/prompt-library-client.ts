import {
  PromptGenerationPayload,
  PromptGenerationResult,
  PromptListFilters,
  PromptRecord,
  PromptSet,
  RunType,
} from "../domain/core";

export interface PromptLibraryClient {
  generate_project_prompts(
    project_id: string,
    payload: PromptGenerationPayload,
  ): Promise<PromptGenerationResult>;
  list_project_prompts(
    project_id: string,
    filters?: PromptListFilters,
  ): Promise<PromptRecord[]>;
  get_prompt_set(
    project_id: string,
    run_type: RunType,
    filters?: { limit?: number },
  ): Promise<PromptSet>;
  activate_prompt(project_id: string, prompt_id: string): Promise<PromptRecord>;
  deactivate_prompt(project_id: string, prompt_id: string): Promise<PromptRecord>;
}
