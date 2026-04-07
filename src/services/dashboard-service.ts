import {
  DashboardProjectSummary,
  ListProjectsFilters,
  Project,
  ProjectOverview,
  PromptRecord,
  PromptSummary,
  RunBatch,
  RunSummary,
  ServiceWarning,
} from "../domain/core";
import { to_service_warning } from "../lib/warnings";
import { ProjectRepository } from "../repositories/project-repository";
import { PromptLibraryClient } from "../clients/prompt-library-client";
import { PromptRunnerClient } from "../clients/prompt-runner-client";
import { ProjectService } from "./project-service";

export class DashboardService {
  constructor(
    private readonly project_service: ProjectService,
    private readonly project_repository: ProjectRepository,
    private readonly prompt_library_client: PromptLibraryClient,
    private readonly prompt_runner_client: PromptRunnerClient,
  ) {}

  async get_project_overview(user_id: string, project_id: string): Promise<ProjectOverview> {
    const project = await this.project_service.assert_project_access(user_id, project_id);
    const competitors = await this.project_repository.list_competitors(project_id);
    const warnings: ServiceWarning[] = [];

    const [prompt_result, run_batch_result] = await Promise.allSettled([
      this.prompt_library_client.list_project_prompts(project_id),
      this.prompt_runner_client.list_run_batches(project_id, { limit: 5 }),
    ]);

    let prompt_summary: PromptSummary | null = null;
    let latest_runs: RunSummary[] = [];

    if (prompt_result.status === "fulfilled") {
      prompt_summary = build_prompt_summary(prompt_result.value);
    } else {
      warnings.push(
        to_service_warning(
          "prompt_library",
          prompt_result.reason,
          "prompt_summary_unavailable",
          "Prompt summary is currently unavailable",
        ),
      );
    }

    if (run_batch_result.status === "fulfilled") {
      latest_runs = await this.build_run_summaries(run_batch_result.value, warnings);
    } else {
      warnings.push(
        to_service_warning(
          "prompt_runner",
          run_batch_result.reason,
          "run_summary_unavailable",
          "Run summary is currently unavailable",
        ),
      );
    }

    return {
      project,
      competitors,
      prompt_summary,
      latest_runs,
      health_flags: build_health_flags(project, latest_runs, warnings),
      warnings,
    };
  }

  async list_dashboard_projects(
    user_id: string,
    filters?: ListProjectsFilters,
  ): Promise<DashboardProjectSummary[]> {
    const projects = await this.project_service.list_projects(user_id, filters);

    return Promise.all(
      projects.map(async (project) => {
        const warnings: ServiceWarning[] = [];

        const [prompt_result, run_batch_result] = await Promise.allSettled([
          this.prompt_library_client.list_project_prompts(project.id, { is_active: true }),
          this.prompt_runner_client.list_run_batches(project.id, { limit: 1 }),
        ]);

        const prompt_summary =
          prompt_result.status === "fulfilled"
            ? build_prompt_summary(prompt_result.value)
            : (warnings.push(
                to_service_warning(
                  "prompt_library",
                  prompt_result.reason,
                  "project_prompt_summary_unavailable",
                  "Prompt summary is currently unavailable",
                ),
              ),
              null);

        const latest_runs =
          run_batch_result.status === "fulfilled"
            ? await this.build_run_summaries(run_batch_result.value, warnings)
            : (warnings.push(
                to_service_warning(
                  "prompt_runner",
                  run_batch_result.reason,
                  "project_run_summary_unavailable",
                  "Run summary is currently unavailable",
                ),
              ),
              []);

        return {
          project,
          prompt_summary,
          latest_run: latest_runs[0] ?? null,
          warnings,
        };
      }),
    );
  }

  private async build_run_summaries(
    run_batches: RunBatch[],
    warnings: ServiceWarning[],
  ): Promise<RunSummary[]> {
    const progress_results = await Promise.allSettled(
      run_batches.map((run_batch) => this.prompt_runner_client.get_run_progress(run_batch.id)),
    );

    return run_batches.map((run_batch, index) => {
      const progress_result = progress_results[index];

      if (progress_result?.status === "rejected") {
        warnings.push(
          to_service_warning(
            "prompt_runner",
            progress_result.reason,
            "run_progress_unavailable",
            "Run progress is currently unavailable",
          ),
        );
      }

      return {
        run_batch_id: run_batch.id,
        run_type: run_batch.run_type,
        status: run_batch.status,
        prompt_count: run_batch.prompt_ids.length,
        execution_count: run_batch.execution_count,
        started_at: run_batch.started_at,
        completed_at: run_batch.completed_at,
        progress: progress_result?.status === "fulfilled" ? progress_result.value : null,
      };
    });
  }
}

function build_prompt_summary(prompts: PromptRecord[]): PromptSummary {
  return prompts.reduce<PromptSummary>(
    (summary, prompt) => {
      if (prompt.is_active) {
        summary.active_prompts += 1;
      }

      summary.total_prompts += 1;

      if (prompt.cluster) {
        summary.by_cluster[prompt.cluster] = (summary.by_cluster[prompt.cluster] ?? 0) + 1;
      }

      if (prompt.intent) {
        summary.by_intent[prompt.intent] = (summary.by_intent[prompt.intent] ?? 0) + 1;
      }

      return summary;
    },
    {
      total_prompts: 0,
      active_prompts: 0,
      by_cluster: {},
      by_intent: {},
    },
  );
}

function build_health_flags(
  project: Project,
  latest_runs: RunSummary[],
  warnings: ServiceWarning[],
): string[] {
  const flags: string[] = [];

  if (project.status !== "active") {
    flags.push(`project_${project.status}`);
  }

  if (latest_runs.some((run) => run.status === "failed")) {
    flags.push("run_failure");
  }

  if (warnings.length > 0) {
    flags.push("partial_data");
  }

  return flags;
}
