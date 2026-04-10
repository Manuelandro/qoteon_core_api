import { type Pool } from "pg";

import { throw_postgres_error } from "../db/postgres";
import {
  BeginIdempotencyRecordInput,
  BeginIdempotencyRecordResult,
  WorkflowIdempotencyRepository,
} from "./workflow-idempotency-repository";

interface WorkflowIdempotencyRow {
  id: string;
  request_hash: string;
  status: "in_progress" | "completed";
  response_status_code: number | null;
  response_body_json: unknown | null;
}

export class PostgresWorkflowIdempotencyRepository implements WorkflowIdempotencyRepository {
  constructor(private readonly pool: Pool) {}

  async begin(input: BeginIdempotencyRecordInput): Promise<BeginIdempotencyRecordResult> {
    try {
      await this.pool.query(
        `
          DELETE FROM public.core_workflow_idempotency
          WHERE expires_at <= timezone('utc', now())
        `,
      );

      const insert_result = await this.pool.query<{ id: string }>(
        `
          INSERT INTO public.core_workflow_idempotency (
            operation,
            user_id,
            project_id,
            idempotency_key,
            request_hash,
            status,
            expires_at
          )
          VALUES (
            $1,
            $2,
            $3::uuid,
            $4,
            $5,
            'in_progress',
            timezone('utc', now()) + make_interval(secs => $6::int)
          )
          ON CONFLICT (operation, user_id, project_id, idempotency_key)
          DO NOTHING
          RETURNING id
        `,
        [
          input.operation,
          input.user_id,
          input.project_id,
          input.idempotency_key,
          input.request_hash,
          input.ttl_seconds,
        ],
      );

      const inserted = insert_result.rows[0];

      if (inserted) {
        return {
          state: "started",
          record_id: inserted.id,
        };
      }

      const existing_result = await this.pool.query<WorkflowIdempotencyRow>(
        `
          SELECT id, request_hash, status, response_status_code, response_body_json
          FROM public.core_workflow_idempotency
          WHERE operation = $1
            AND user_id = $2
            AND project_id = $3::uuid
            AND idempotency_key = $4
          LIMIT 1
        `,
        [input.operation, input.user_id, input.project_id, input.idempotency_key],
      );

      const existing = existing_result.rows[0];

      if (!existing) {
        return {
          state: "in_progress",
        };
      }

      if (existing.request_hash !== input.request_hash) {
        return {
          state: "request_mismatch",
        };
      }

      if (existing.status === "completed" && existing.response_status_code !== null) {
        return {
          state: "replay",
          response_status_code: existing.response_status_code,
          response_body: existing.response_body_json,
        };
      }

      return {
        state: "in_progress",
      };
    } catch (error) {
      throw_postgres_error(as_postgres_error(error), "Unable to reserve idempotency key");
    }
  }

  async complete(
    record_id: string,
    input: {
      response_status_code: number;
      response_body: unknown;
      ttl_seconds: number;
    },
  ): Promise<void> {
    try {
      await this.pool.query(
        `
          UPDATE public.core_workflow_idempotency
          SET
            status = 'completed',
            response_status_code = $2,
            response_body_json = $3::jsonb,
            expires_at = timezone('utc', now()) + make_interval(secs => $4::int),
            updated_at = timezone('utc', now())
          WHERE id = $1::uuid
        `,
        [record_id, input.response_status_code, JSON.stringify(input.response_body), input.ttl_seconds],
      );
    } catch (error) {
      throw_postgres_error(as_postgres_error(error), "Unable to finalize idempotency key");
    }
  }

  async release(record_id: string): Promise<void> {
    try {
      await this.pool.query(
        `
          DELETE FROM public.core_workflow_idempotency
          WHERE id = $1::uuid
        `,
        [record_id],
      );
    } catch (error) {
      throw_postgres_error(as_postgres_error(error), "Unable to release idempotency key");
    }
  }
}

function as_postgres_error(error: unknown): { message?: string; code?: string; detail?: string | null } | null {
  if (error && typeof error === "object") {
    const candidate = error as { message?: string; code?: string; detail?: string | null };
    return candidate;
  }

  return null;
}
