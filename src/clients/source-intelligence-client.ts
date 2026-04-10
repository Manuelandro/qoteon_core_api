import {
  SourceIntelligenceCrawlRequest,
  SourceIntelligenceCrawlRun,
  SourceIntelligenceCrawlTarget,
  SourceIntelligencePromptContext,
} from "../domain/core";

export interface SourceIntelligenceClient {
  bootstrap_crawl_targets(project_id: string): Promise<{
    project_id: string;
    targets: SourceIntelligenceCrawlTarget[];
  }>;
  create_crawl_runs(
    project_id: string,
    payload: SourceIntelligenceCrawlRequest & {
      trigger_type?: "project_setup" | "manual" | "scheduled" | "refresh";
    },
  ): Promise<{
    project_id: string;
    crawl_runs: SourceIntelligenceCrawlRun[];
  }>;
  list_crawl_runs(
    project_id: string,
    filters?: { status?: string; limit?: number },
  ): Promise<SourceIntelligenceCrawlRun[]>;
  get_prompt_context(project_id: string): Promise<SourceIntelligencePromptContext>;
}
