import { DownstreamServiceError } from "../errors/app-error";

type DownstreamServiceName =
  | "prompt_library"
  | "prompt_runner"
  | "source_intelligence"
  | "dashboard_layer"
  | "reconciler"
  | "daily_runner";

export interface HttpJsonClientOptions {
  service: DownstreamServiceName;
  base_url?: string;
  auth_token?: string;
  timeout_ms?: number;
  logger?: {
    info: (obj: Record<string, unknown>, msg?: string) => void;
    error: (obj: Record<string, unknown>, msg?: string) => void;
  };
}

export class HttpJsonClient {
  private readonly base_url?: string;
  private readonly auth_token?: string;
  private readonly timeout_ms: number;
  private readonly logger?: HttpJsonClientOptions["logger"];

  constructor(private readonly options: HttpJsonClientOptions) {
    this.base_url = options.base_url;
    this.auth_token = options.auth_token;
    this.timeout_ms = options.timeout_ms ?? 10000;
    this.logger = options.logger;
  }

  async request<T>(
    method: string,
    path: string,
    options?: {
      query?: object;
      body?: unknown;
      headers?: Record<string, string>;
    },
  ): Promise<T> {
    if (!this.base_url) {
      throw new DownstreamServiceError(
        this.options.service,
        `${this.options.service} base URL is not configured`,
      );
    }

    const url = new URL(path, this.base_url);
    append_query(url, options?.query);
    const started_at = Date.now();

    this.logger?.info(
      {
        downstream_service: this.options.service,
        method,
        path,
        url: url.toString(),
        timeout_ms: this.timeout_ms,
        query: sanitize_for_log(options?.query),
        request_body: sanitize_for_log(options?.body),
      },
      `Request sent to ${format_service_name(this.options.service)}`,
    );

    let response: Response;

    try {
      response = await fetch(url, {
        method,
        headers: {
          accept: "application/json",
          ...(options?.body === undefined ? {} : { "content-type": "application/json" }),
          ...(this.auth_token ? { authorization: `Bearer ${this.auth_token}` } : {}),
          ...options?.headers,
        },
        body: options?.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(this.timeout_ms),
      });
    } catch (error) {
      this.logger?.error(
        {
          downstream_service: this.options.service,
          method,
          path,
          url: url.toString(),
          duration_ms: Date.now() - started_at,
          reason: error instanceof Error ? error.message : "unknown",
        },
        `Downstream request failed for ${format_service_name(this.options.service)}`,
      );
      throw new DownstreamServiceError(this.options.service, `Unable to reach ${this.options.service}`, {
        reason: error instanceof Error ? error.message : "unknown",
      });
    }

    if (!response.ok) {
      const error_body = await safe_json(response);
      this.logger?.error(
        {
          downstream_service: this.options.service,
          method,
          path,
          url: url.toString(),
          duration_ms: Date.now() - started_at,
          status_code: response.status,
          response_body: sanitize_for_log(error_body),
        },
        `Downstream error response from ${format_service_name(this.options.service)}`,
      );
      throw new DownstreamServiceError(
        this.options.service,
        `${this.options.service} returned ${response.status}`,
        {
          status_code: response.status,
          response_body: error_body ?? undefined,
        },
      );
    }

    if (response.status === 204) {
      this.logger?.info(
        {
          downstream_service: this.options.service,
          method,
          path,
          url: url.toString(),
          duration_ms: Date.now() - started_at,
          status_code: response.status,
        },
        `Response received from ${format_service_name(this.options.service)}`,
      );
      return undefined as T;
    }

    this.logger?.info(
      {
        downstream_service: this.options.service,
        method,
        path,
        url: url.toString(),
        duration_ms: Date.now() - started_at,
        status_code: response.status,
      },
      `Response received from ${format_service_name(this.options.service)}`,
    );
    return (await response.json()) as T;
  }
}

function format_service_name(service: DownstreamServiceName): string {
  switch (service) {
    case "prompt_runner":
      return "Prompt Runner";
    case "prompt_library":
      return "Prompt Library";
    case "source_intelligence":
      return "Source Intelligence";
    case "dashboard_layer":
      return "Dashboard Layer";
    case "reconciler":
      return "Reconciler";
    case "daily_runner":
      return "Daily Runner";
    default:
      return service;
  }
}

function sanitize_for_log(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitize_for_log(item));
  }

  if (typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;

  return Object.fromEntries(
    Object.entries(record).map(([key, nested_value]) => {
      if (["authorization", "auth_token", "token", "access_token", "refresh_token"].includes(key.toLowerCase())) {
        return [key, "[redacted]"];
      }

      return [key, sanitize_for_log(nested_value)];
    }),
  );
}

function append_query(url: URL, query?: object): void {
  if (!query) {
    return;
  }

  for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => url.searchParams.append(key, String(item)));
      continue;
    }

    url.searchParams.set(key, String(value));
  }
}

async function safe_json(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
