import { DownstreamServiceError } from "../errors/app-error";

type DownstreamServiceName =
  | "prompt_library"
  | "prompt_runner"
  | "source_intelligence"
  | "dashboard_layer";

export interface HttpJsonClientOptions {
  service: DownstreamServiceName;
  base_url?: string;
  auth_token?: string;
  timeout_ms?: number;
}

export class HttpJsonClient {
  private readonly base_url?: string;
  private readonly auth_token?: string;
  private readonly timeout_ms: number;

  constructor(private readonly options: HttpJsonClientOptions) {
    this.base_url = options.base_url;
    this.auth_token = options.auth_token;
    this.timeout_ms = options.timeout_ms ?? 10000;
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
      throw new DownstreamServiceError(this.options.service, `Unable to reach ${this.options.service}`, {
        reason: error instanceof Error ? error.message : "unknown",
      });
    }

    if (!response.ok) {
      const error_body = await safe_json(response);
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
      return undefined as T;
    }

    return (await response.json()) as T;
  }
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
