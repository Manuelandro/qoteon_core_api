export type WorkflowIdempotencyOperation = "run_launch" | "crawl_trigger";

export interface BeginIdempotencyRecordInput {
  operation: WorkflowIdempotencyOperation;
  user_id: string;
  project_id: string;
  idempotency_key: string;
  request_hash: string;
  ttl_seconds: number;
}

export type BeginIdempotencyRecordResult =
  | { state: "started"; record_id: string }
  | { state: "in_progress" }
  | { state: "request_mismatch" }
  | {
      state: "replay";
      response_status_code: number;
      response_body: unknown;
    };

export interface WorkflowIdempotencyRepository {
  begin(input: BeginIdempotencyRecordInput): Promise<BeginIdempotencyRecordResult>;
  complete(
    record_id: string,
    input: {
      response_status_code: number;
      response_body: unknown;
      ttl_seconds: number;
    },
  ): Promise<void>;
  release(record_id: string): Promise<void>;
}
