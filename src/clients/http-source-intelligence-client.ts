import {
  SourceIntelligenceCrawlRequest,
  SourceIntelligenceCrawlRun,
  SourceIntelligenceCrawlTarget,
  SourceIntelligencePromptContext,
} from "../domain/core";
import { HttpJsonClient } from "./http-client";
import { SourceIntelligenceClient } from "./source-intelligence-client";

export class HttpSourceIntelligenceClient implements SourceIntelligenceClient {
  constructor(private readonly client: HttpJsonClient) {}

  async bootstrap_crawl_targets(project_id: string): Promise<{
    project_id: string;
    targets: SourceIntelligenceCrawlTarget[];
  }> {
    return this.client.request("POST", `/internal/projects/${project_id}/crawl-targets/bootstrap`);
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
    return this.client.request("POST", `/internal/projects/${project_id}/crawl-runs`, {
      body: payload,
    });
  }

  async list_crawl_runs(
    project_id: string,
    filters?: { status?: string; limit?: number },
  ): Promise<SourceIntelligenceCrawlRun[]> {
    const response = await this.client.request<{ crawl_runs: SourceIntelligenceCrawlRun[] }>(
      "GET",
      `/internal/projects/${project_id}/crawl-runs`,
      {
        query: filters,
      },
    );

    return response.crawl_runs;
  }

  async get_prompt_context(project_id: string): Promise<SourceIntelligencePromptContext> {
    return this.client.request("GET", `/internal/projects/${project_id}/prompt-context`);
  }
}
