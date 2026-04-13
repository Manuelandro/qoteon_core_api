export class AppError extends Error {
  readonly status_code: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly expose: boolean;

  constructor(
    message: string,
    options: {
      status_code: number;
      code: string;
      details?: Record<string, unknown>;
      expose?: boolean;
    },
  ) {
    super(message);
    this.name = this.constructor.name;
    this.status_code = options.status_code;
    this.code = options.code;
    this.details = options.details;
    this.expose = options.expose ?? true;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, { status_code: 400, code: "validation_error", details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication is required") {
    super(message, { status_code: 401, code: "unauthorized" });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have access to this resource") {
    super(message, { status_code: 403, code: "forbidden" });
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, { status_code: 404, code: "not_found" });
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, { status_code: 409, code: "conflict", details });
  }
}

export class TooManyRequestsError extends AppError {
  constructor(
    message: string,
    options?: {
      code?: string;
      details?: Record<string, unknown>;
      retry_after_seconds?: number;
    },
  ) {
    super(message, {
      status_code: 429,
      code: options?.code ?? "too_many_requests",
      details: {
        ...(options?.details ?? {}),
        retry_after_seconds: options?.retry_after_seconds,
      },
    });
  }
}

export class DownstreamServiceError extends AppError {
  constructor(
    service:
      | "prompt_library"
      | "prompt_runner"
      | "source_intelligence"
      | "dashboard_layer"
      | "reconciler"
      | "daily_runner",
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message, {
      status_code: 502,
      code: `${service}_error`,
      details: { service, ...details },
    });
  }
}
