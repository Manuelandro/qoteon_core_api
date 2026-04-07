export const PLAN_TYPES = ["starter", "growth", "enterprise"] as const;
export const USER_ROLES = ["owner", "admin", "member"] as const;
export const ORGANIZATION_ROLES = ["owner", "admin", "member"] as const;
export const PROJECT_STATUSES = ["draft", "active", "paused", "archived"] as const;
export const RUN_TYPES = ["baseline", "monthly_tracking"] as const;

export type PlanType = (typeof PLAN_TYPES)[number];
export type UserRole = (typeof USER_ROLES)[number];
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type RunType = (typeof RUN_TYPES)[number];

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan_type: PlanType;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface OrganizationUser {
  id: string;
  organization_id: string;
  user_id: string;
  org_role: OrganizationRole;
  created_at: string;
}

export interface Project {
  id: string;
  organization_id: string;
  name: string;
  domain: string;
  company_name: string;
  primary_category: string;
  target_region: string;
  target_language: string;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
}

export interface ProjectCompetitor {
  id: string;
  project_id: string;
  competitor_name: string;
  competitor_domain: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthenticatedUser {
  user_id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
}

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  plan_type: PlanType;
}

export interface CreateProjectInput {
  organization_id: string;
  name: string;
  domain: string;
  company_name: string;
  primary_category: string;
  target_region: string;
  target_language: string;
  status?: ProjectStatus;
}

export interface UpdateProjectInput {
  name?: string;
  domain?: string;
  company_name?: string;
  primary_category?: string;
  target_region?: string;
  target_language?: string;
  status?: ProjectStatus;
}

export interface CreateCompetitorInput {
  competitor_name: string;
  competitor_domain: string;
  notes?: string | null;
}

export interface UpdateCompetitorInput {
  competitor_name?: string;
  competitor_domain?: string;
  notes?: string | null;
}

export interface ListProjectsFilters {
  organization_id?: string;
  status?: ProjectStatus;
}

export interface PromptGenerationPayload {
  prompt_count?: number;
  intents?: string[];
  seed_topics?: string[];
  metadata_json?: Record<string, unknown>;
}

export interface PromptGenerationResult {
  project_id: string;
  generated_count: number;
  total_prompts: number;
  active_prompts: number;
  prompt_ids: string[];
}

export interface PromptListFilters {
  status?: string;
  is_active?: boolean;
}

export interface PromptRecord {
  id: string;
  project_id: string;
  title: string;
  body?: string | null;
  cluster?: string | null;
  intent?: string | null;
  status: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PromptSet {
  project_id: string;
  run_type: RunType;
  prompt_ids: string[];
  prompt_count: number;
  active_prompt_count: number;
}

export interface ListRunBatchesFilters {
  status?: string;
  run_type?: RunType;
  start_date?: string;
  end_date?: string;
  limit?: number;
}

export interface RunBatch {
  id: string;
  project_id: string;
  run_type: RunType;
  status: string;
  prompt_ids: string[];
  ai_model_ids: string[];
  execution_count: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  metadata_json: Record<string, unknown> | null;
}

export interface RunProgress {
  run_batch_id: string;
  status: string;
  total_executions: number;
  queued_executions: number;
  running_executions: number;
  completed_executions: number;
  failed_executions: number;
  progress_percent: number;
  updated_at?: string;
}

export interface ListExecutionsFilters {
  status?: string;
}

export interface ExecutionRecord {
  id: string;
  run_batch_id: string;
  project_id?: string;
  prompt_id: string;
  ai_model_id: string;
  status: string;
  provider: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}

export interface ServiceWarning {
  code: string;
  message: string;
  service: "core_api" | "prompt_library" | "prompt_runner";
  retryable: boolean;
  details?: Record<string, unknown>;
}

export interface PromptSummary {
  total_prompts: number;
  active_prompts: number;
  by_cluster: Record<string, number>;
  by_intent: Record<string, number>;
}

export interface RunSummary {
  run_batch_id: string;
  run_type: RunType;
  status: string;
  prompt_count: number;
  execution_count: number;
  started_at: string | null;
  completed_at: string | null;
  progress: RunProgress | null;
}

export interface SetupProjectResult {
  status: "success" | "partial_success";
  project: Project;
  competitors: ProjectCompetitor[];
  prompt_generation: {
    attempted: boolean;
    succeeded: boolean;
    result: PromptGenerationResult | null;
  };
  warnings: ServiceWarning[];
}

export interface LaunchRunResult {
  prompt_set: PromptSet;
  run_batch: RunBatch;
}

export interface ProjectOverview {
  project: Project;
  competitors: ProjectCompetitor[];
  prompt_summary: PromptSummary | null;
  latest_runs: RunSummary[];
  health_flags: string[];
  warnings: ServiceWarning[];
}

export interface DashboardProjectSummary {
  project: Project;
  prompt_summary: PromptSummary | null;
  latest_run: RunSummary | null;
  warnings: ServiceWarning[];
}

export interface PromptSetSummary {
  project_id: string;
  run_type: RunType;
  prompt_count: number;
  active_prompt_count: number;
}
