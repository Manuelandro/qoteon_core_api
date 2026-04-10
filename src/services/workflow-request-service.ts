import { createHash } from "node:crypto";

import { type Pool, type PoolClient } from "pg";

import {
  LaunchRunResult,
  SourceIntelligenceCrawlRequest,
  SourceIntelligenceCrawlRun,
} from "../domain/core";
import { ConflictError, TooManyRequestsError, ValidationError } from "../errors/app-error";
import {
  BeginIdempotencyRecordResult,
  WorkflowIdempotencyOperation,
  WorkflowIdempotencyRepository,
} from "../repositories/workflow-idempotency-repository";
import { OrchestrationService } from "./orchestration-service";

interface WorkflowConcurrencyScope {
  operation: WorkflowIdempotencyOperation;
  user_id: string;
  project_id: string;
}

export interface WorkflowConcurrencyGuard {
  with_scope<T>(scope: WorkflowConcurrencyScope, callback: () => Promise<T>): Promise<T>;
}

export interface WorkflowRequestServiceOptions {
  explicit_idempotency_ttl_seconds: number;
  implicit_idempotency_ttl_seconds: number;
  require_idempotency_header: boolean;
}

export interface WorkflowResponse<T> {
  response_status_code: number;
  response_body: T;
  replayed: boolean;
}

export class WorkflowRequestService {
  constructor(
    private readonly orchestration_service: OrchestrationService,
    private readonly idempotency_repository: WorkflowIdempotencyRepository,
    private readonly concurrency_guard: WorkflowConcurrencyGuard,
    private readonly options: WorkflowRequestServiceOptions,
  ) {}

  launch_baseline_scan(
    input: {
      user_id: string;
      project_id: string;
      ai_model_ids: string[];
      metadata_json?: Record<string, unknown>;
      idempotency_key?: string;
    },
  ): Promise<WorkflowResponse<LaunchRunResult>> {
    return this.execute_workflow<LaunchRunResult>({
      operation: "run_launch",
      user_id: input.user_id,
      project_id: input.project_id,
      idempotency_key: input.idempotency_key,
      request_payload: {
        run_type: "baseline",
        ai_model_ids: input.ai_model_ids,
        metadata_json: input.metadata_json,
      },
      callback: () =>
        this.orchestration_service.launch_baseline_scan(
          input.user_id,
          input.project_id,
          input.ai_model_ids,
          input.metadata_json,
        ),
    });
  }

  launch_monthly_tracking(
    input: {
      user_id: string;
      project_id: string;
      ai_model_ids: string[];
      metadata_json?: Record<string, unknown>;
      idempotency_key?: string;
    },
  ): Promise<WorkflowResponse<LaunchRunResult>> {
    return this.execute_workflow<LaunchRunResult>({
      operation: "run_launch",
      user_id: input.user_id,
      project_id: input.project_id,
      idempotency_key: input.idempotency_key,
      request_payload: {
        run_type: "monthly_tracking",
        ai_model_ids: input.ai_model_ids,
        metadata_json: input.metadata_json,
      },
      callback: () =>
        this.orchestration_service.launch_monthly_tracking(
          input.user_id,
          input.project_id,
          input.ai_model_ids,
          input.metadata_json,
        ),
    });
  }

  trigger_project_crawl(
    input: {
      user_id: string;
      project_id: string;
      crawl_payload: SourceIntelligenceCrawlRequest;
      idempotency_key?: string;
    },
  ): Promise<
    WorkflowResponse<{
      project_id: string;
      crawl_runs: SourceIntelligenceCrawlRun[];
    }>
  > {
    return this.execute_workflow({
      operation: "crawl_trigger",
      user_id: input.user_id,
      project_id: input.project_id,
      idempotency_key: input.idempotency_key,
      request_payload: input.crawl_payload,
      callback: () =>
        this.orchestration_service.trigger_project_crawl(
          input.user_id,
          input.project_id,
          input.crawl_payload,
        ),
    });
  }

  private async execute_workflow<T>(input: {
    operation: WorkflowIdempotencyOperation;
    user_id: string;
    project_id: string;
    idempotency_key?: string;
    request_payload: unknown;
    callback: () => Promise<T>;
  }): Promise<WorkflowResponse<T>> {
    const request_hash = hash_payload(input.request_payload);
    const idempotency_key = this.resolve_idempotency_key(input.idempotency_key, request_hash);
    const ttl_seconds =
      input.idempotency_key && input.idempotency_key.trim().length > 0
        ? this.options.explicit_idempotency_ttl_seconds
        : this.options.implicit_idempotency_ttl_seconds;

    const begin_result = await this.idempotency_repository.begin({
      operation: input.operation,
      user_id: input.user_id,
      project_id: input.project_id,
      idempotency_key,
      request_hash,
      ttl_seconds,
    });

    const replay = this.resolve_replay<T>(begin_result);

    if (replay) {
      return replay;
    }

    if (begin_result.state === "request_mismatch") {
      throw new ConflictError("Idempotency key was already used with a different request payload", {
        operation: input.operation,
        idempotency_key,
      });
    }

    if (begin_result.state !== "started") {
      throw new TooManyRequestsError("A matching request is already in progress", {
        code: "idempotency_in_progress",
        retry_after_seconds: 1,
        details: {
          operation: input.operation,
          idempotency_key,
        },
      });
    }

    try {
      const response_body = await this.concurrency_guard.with_scope(
        {
          operation: input.operation,
          user_id: input.user_id,
          project_id: input.project_id,
        },
        input.callback,
      );

      await this.idempotency_repository.complete(begin_result.record_id, {
        response_status_code: 201,
        response_body,
        ttl_seconds,
      });

      return {
        response_status_code: 201,
        response_body,
        replayed: false,
      };
    } catch (error) {
      await this.idempotency_repository.release(begin_result.record_id);
      throw error;
    }
  }

  private resolve_idempotency_key(
    provided_key: string | undefined,
    request_hash: string,
  ): string {
    const normalized = provided_key?.trim();

    if (normalized) {
      return normalized;
    }

    if (this.options.require_idempotency_header) {
      throw new ValidationError("Idempotency-Key header is required for this endpoint");
    }

    return `implicit:${request_hash}`;
  }

  private resolve_replay<T>(
    begin_result: BeginIdempotencyRecordResult,
  ): WorkflowResponse<T> | null {
    if (begin_result.state !== "replay") {
      return null;
    }

    return {
      response_status_code: begin_result.response_status_code,
      response_body: begin_result.response_body as T,
      replayed: true,
    };
  }
}

export class PostgresWorkflowConcurrencyGuard implements WorkflowConcurrencyGuard {
  constructor(private readonly pool: Pool) {}

  async with_scope<T>(scope: WorkflowConcurrencyScope, callback: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const locks = build_lock_keys(scope);
    const acquired: Array<[number, number]> = [];

    try {
      for (const [namespace_key, lock_key] of locks) {
        const result = await client.query<{ locked: boolean }>(
          `
            SELECT pg_try_advisory_lock($1::int, $2::int) AS locked
          `,
          [namespace_key, lock_key],
        );

        if (!result.rows[0]?.locked) {
          throw new TooManyRequestsError("Workflow already in progress for this actor or project", {
            code: "workflow_concurrency_guard",
            retry_after_seconds: 1,
            details: {
              operation: scope.operation,
            },
          });
        }

        acquired.push([namespace_key, lock_key]);
      }

      return await callback();
    } finally {
      await release_locks(client, acquired);
      client.release();
    }
  }
}

export class InMemoryWorkflowConcurrencyGuard implements WorkflowConcurrencyGuard {
  private readonly active_locks = new Set<string>();

  async with_scope<T>(scope: WorkflowConcurrencyScope, callback: () => Promise<T>): Promise<T> {
    const lock_keys = [
      `${scope.operation}:user:${scope.user_id}`,
      `${scope.operation}:project:${scope.project_id}`,
    ];

    for (const lock_key of lock_keys) {
      if (this.active_locks.has(lock_key)) {
        throw new TooManyRequestsError("Workflow already in progress for this actor or project", {
          code: "workflow_concurrency_guard",
          retry_after_seconds: 1,
          details: {
            operation: scope.operation,
          },
        });
      }
    }

    for (const lock_key of lock_keys) {
      this.active_locks.add(lock_key);
    }

    try {
      return await callback();
    } finally {
      for (const lock_key of lock_keys) {
        this.active_locks.delete(lock_key);
      }
    }
  }
}

async function release_locks(client: PoolClient, locks: Array<[number, number]>): Promise<void> {
  for (let index = locks.length - 1; index >= 0; index -= 1) {
    const lock = locks[index];

    if (!lock) {
      continue;
    }

    await client.query(`SELECT pg_advisory_unlock($1::int, $2::int)`, [lock[0], lock[1]]);
  }
}

function build_lock_keys(scope: WorkflowConcurrencyScope): Array<[number, number]> {
  const namespace_key = hash32(`qoteon_core:${scope.operation}`);

  return [
    [namespace_key, hash32(`${scope.operation}:user:${scope.user_id}`)],
    [namespace_key, hash32(`${scope.operation}:project:${scope.project_id}`)],
  ];
}

function hash32(input: string): number {
  const digest = createHash("sha256").update(input).digest();
  return digest.readInt32BE(0) & 0x7fffffff;
}

function hash_payload(payload: unknown): string {
  return createHash("sha256").update(stable_serialize(payload)).digest("hex");
}

function stable_serialize(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stable_serialize(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return `{${entries
    .map(([key, entry_value]) => `${JSON.stringify(key)}:${stable_serialize(entry_value)}`)
    .join(",")}}`;
}
