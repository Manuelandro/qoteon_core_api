import {
  BeginIdempotencyRecordInput,
  BeginIdempotencyRecordResult,
  WorkflowIdempotencyRepository,
} from "./workflow-idempotency-repository";

interface InMemoryRecord {
  id: string;
  operation: BeginIdempotencyRecordInput["operation"];
  user_id: string;
  project_id: string;
  idempotency_key: string;
  request_hash: string;
  status: "in_progress" | "completed";
  response_status_code: number | null;
  response_body: unknown;
  expires_at_ms: number;
}

export class InMemoryWorkflowIdempotencyRepository implements WorkflowIdempotencyRepository {
  private readonly records = new Map<string, InMemoryRecord>();
  private counter = 0;

  async begin(input: BeginIdempotencyRecordInput): Promise<BeginIdempotencyRecordResult> {
    this.cleanup(Date.now());
    const key = this.build_key(
      input.operation,
      input.user_id,
      input.project_id,
      input.idempotency_key,
    );
    const existing = this.records.get(key);

    if (!existing) {
      const record_id = `idempotency-${++this.counter}`;
      this.records.set(key, {
        id: record_id,
        operation: input.operation,
        user_id: input.user_id,
        project_id: input.project_id,
        idempotency_key: input.idempotency_key,
        request_hash: input.request_hash,
        status: "in_progress",
        response_status_code: null,
        response_body: null,
        expires_at_ms: Date.now() + input.ttl_seconds * 1000,
      });

      return {
        state: "started",
        record_id,
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
        response_body: existing.response_body,
      };
    }

    return {
      state: "in_progress",
    };
  }

  async complete(
    record_id: string,
    input: {
      response_status_code: number;
      response_body: unknown;
      ttl_seconds: number;
    },
  ): Promise<void> {
    const record = this.find_by_id(record_id);

    if (!record) {
      return;
    }

    record.status = "completed";
    record.response_status_code = input.response_status_code;
    record.response_body = input.response_body;
    record.expires_at_ms = Date.now() + input.ttl_seconds * 1000;
  }

  async release(record_id: string): Promise<void> {
    const target_entry = [...this.records.entries()].find(([, record]) => record.id === record_id);

    if (target_entry) {
      this.records.delete(target_entry[0]);
    }
  }

  private cleanup(now_ms: number): void {
    for (const [key, record] of this.records.entries()) {
      if (record.expires_at_ms <= now_ms) {
        this.records.delete(key);
      }
    }
  }

  private find_by_id(record_id: string): InMemoryRecord | null {
    for (const record of this.records.values()) {
      if (record.id === record_id) {
        return record;
      }
    }

    return null;
  }

  private build_key(
    operation: BeginIdempotencyRecordInput["operation"],
    user_id: string,
    project_id: string,
    idempotency_key: string,
  ): string {
    return `${operation}:${user_id}:${project_id}:${idempotency_key}`;
  }
}
