import { TooManyRequestsError } from "../errors/app-error";

type RouteCategory = "default" | "project_create" | "run_launch" | "crawl_trigger";

interface FixedWindowEntry {
  window_started_ms: number;
  count: number;
}

export interface PublicEdgeGuardOptions {
  rate_limit_window_ms: number;
  rate_limit_default_max: number;
  rate_limit_project_create_max: number;
  rate_limit_run_launch_max: number;
  rate_limit_crawl_trigger_max: number;
  max_in_flight_requests: number;
  max_in_flight_critical_requests: number;
}

export interface PublicEdgeAdmissionToken {
  category: RouteCategory;
}

export class PublicEdgeGuard {
  private readonly request_windows = new Map<string, FixedWindowEntry>();
  private in_flight_total = 0;
  private in_flight_critical = 0;
  private last_cleanup_ms = 0;

  constructor(private readonly options: PublicEdgeGuardOptions) {}

  enter(input: { method: string; path: string; ip: string }): PublicEdgeAdmissionToken {
    const method = input.method.toUpperCase();
    const category = classify_route(method, input.path);
    const rate_limit = this.resolve_rate_limit(category);
    const now_ms = Date.now();
    const window_key = `${category}:${input.ip}`;
    const retry_after_seconds = Math.ceil(this.options.rate_limit_window_ms / 1000);

    const current = this.request_windows.get(window_key);

    if (
      current &&
      now_ms - current.window_started_ms < this.options.rate_limit_window_ms &&
      current.count >= rate_limit
    ) {
      throw new TooManyRequestsError("Core edge rate limit exceeded", {
        code: "edge_rate_limited",
        retry_after_seconds,
        details: {
          category,
          limit: rate_limit,
          window_ms: this.options.rate_limit_window_ms,
        },
      });
    }

    if (!current || now_ms - current.window_started_ms >= this.options.rate_limit_window_ms) {
      this.request_windows.set(window_key, {
        window_started_ms: now_ms,
        count: 1,
      });
    } else {
      current.count += 1;
    }

    const is_critical = category !== "default";

    if (this.in_flight_total >= this.options.max_in_flight_requests) {
      throw new TooManyRequestsError("Core is under pressure, retry shortly", {
        code: "core_backpressure",
        retry_after_seconds: 1,
        details: {
          max_in_flight_requests: this.options.max_in_flight_requests,
        },
      });
    }

    if (is_critical && this.in_flight_critical >= this.options.max_in_flight_critical_requests) {
      throw new TooManyRequestsError("Core is under pressure on write workflows, retry shortly", {
        code: "core_backpressure",
        retry_after_seconds: 1,
        details: {
          category,
          max_in_flight_critical_requests: this.options.max_in_flight_critical_requests,
        },
      });
    }

    this.in_flight_total += 1;

    if (is_critical) {
      this.in_flight_critical += 1;
    }

    this.cleanup_if_needed(now_ms);

    return { category };
  }

  leave(token: PublicEdgeAdmissionToken): void {
    if (this.in_flight_total > 0) {
      this.in_flight_total -= 1;
    }

    if (token.category !== "default" && this.in_flight_critical > 0) {
      this.in_flight_critical -= 1;
    }
  }

  private resolve_rate_limit(category: RouteCategory): number {
    if (category === "project_create") {
      return this.options.rate_limit_project_create_max;
    }

    if (category === "run_launch") {
      return this.options.rate_limit_run_launch_max;
    }

    if (category === "crawl_trigger") {
      return this.options.rate_limit_crawl_trigger_max;
    }

    return this.options.rate_limit_default_max;
  }

  private cleanup_if_needed(now_ms: number): void {
    if (this.request_windows.size < 4000) {
      return;
    }

    if (now_ms - this.last_cleanup_ms < this.options.rate_limit_window_ms) {
      return;
    }

    this.last_cleanup_ms = now_ms;
    const ttl_ms = this.options.rate_limit_window_ms * 2;

    for (const [key, entry] of this.request_windows.entries()) {
      if (now_ms - entry.window_started_ms > ttl_ms) {
        this.request_windows.delete(key);
      }
    }
  }
}

export function should_skip_public_edge_guard(method: string, path: string): boolean {
  const normalized_method = method.toUpperCase();
  const pathname = extract_pathname(path);
  return (normalized_method === "GET" && pathname === "/health") || pathname.startsWith("/internal/");
}

function classify_route(method: string, path: string): RouteCategory {
  if (method !== "POST") {
    return "default";
  }

  const pathname = extract_pathname(path);

  if (pathname === "/projects") {
    return "project_create";
  }

  if (/^\/projects\/[^/]+\/runs\/[^/]+$/.test(pathname)) {
    return "run_launch";
  }

  if (/^\/projects\/[^/]+\/source-intelligence\/crawl-runs$/.test(pathname)) {
    return "crawl_trigger";
  }

  return "default";
}

function extract_pathname(path: string): string {
  const query_index = path.indexOf("?");
  return query_index === -1 ? path : path.slice(0, query_index);
}
