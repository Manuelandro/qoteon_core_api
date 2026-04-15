import {
  PromptGenerationPayload,
  PromptGenerationResult,
  PromptLibraryItem,
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
  update_prompt(project_id: string, prompt_id: string, prompt_text: string): Promise<PromptRecord>;
  delete_prompt(project_id: string, prompt_id: string): Promise<PromptRecord>;
  activate_prompt(project_id: string, prompt_id: string): Promise<PromptRecord>;
  deactivate_prompt(project_id: string, prompt_id: string): Promise<PromptRecord>;
  list_prompt_library(
    project_id: string,
    filters?: { search?: string; limit?: number },
  ): Promise<PromptLibraryItem[]>;
  import_prompt_library_item(project_id: string, prompt_id: string): Promise<PromptRecord>;
}
