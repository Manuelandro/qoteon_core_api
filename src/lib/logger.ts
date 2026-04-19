/**
 * Structured JSON logger with stdout and append-file sinks.
 *
 * Zero dependencies. Implements the subset of the pino-compatible interface
 * that Fastify v4/v5 expects, so an instance of {@link JsonLogger} can be
 * passed to Fastify via the `loggerInstance` option (or `logger` on v4).
 *
 * One log line is one JSON object per line. Every event includes a `level`,
 * `time`, `service`, and any bound context (project_id, component, etc.).
 *
 * The file sink is append-only and best-effort: write errors on the file
 * stream are swallowed so that a broken disk never crashes the service.
 *
 * File rotation is intentionally not implemented in v1. Operators can rely
 * on external tooling (logrotate, journald) or periodic truncation.
 */

import {
  mkdirSync,
  createWriteStream,
  type WriteStream,
} from "node:fs";
import { resolve as resolve_path, join as join_path } from "node:path";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

const KNOWN_LEVELS: LogLevel[] = ["trace", "debug", "info", "warn", "error", "fatal"];

export interface LoggerSinkConfig {
  log_dir: string;
  filename: string;
  log_to_file: boolean;
  pretty: boolean;
}

export interface LoggerRootConfig {
  service: string;
  component?: string;
  level: LogLevel;
  bindings?: Record<string, unknown>;
  sink: LoggerSinkConfig;
}

export interface LoggerEnvConfig {
  level: LogLevel;
  log_dir: string;
  log_to_file: boolean;
  pretty: boolean;
}

export interface LoggerFactoryInput {
  service: string;
  component?: string;
  filename?: string;
  bindings?: Record<string, unknown>;
  env?: NodeJS.ProcessEnv;
  env_config?: Partial<LoggerEnvConfig>;
}

/**
 * Header names that must be redacted before being logged. Matching is
 * case-insensitive. Callers should pass request header objects through
 * {@link redact_sensitive_headers} before attaching them to log records.
 */
const SENSITIVE_HEADER_NAMES = new Set<string>([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "apikey",
  "x-auth-token",
  "x-supabase-auth",
  "x-internal-auth-token",
  "x-access-token",
]);

export function redact_sensitive_headers(
  headers: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!headers) {
    return headers;
  }

  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADER_NAMES.has(key.toLowerCase())) {
      out[key] = "[REDACTED]";
      continue;
    }

    out[key] = value;
  }

  return out;
}

/**
 * Truncate a potentially unbounded text field so that we don't write
 * multi-megabyte LLM outputs into the log file.
 */
export function truncate_log_text(
  value: string | null | undefined,
  max_length = 2000,
): string | null | undefined {
  if (value === null || value === undefined) {
    return value;
  }

  if (value.length <= max_length) {
    return value;
  }

  return `${value.slice(0, max_length)}…[truncated:${value.length}]`;
}

function is_known_level(candidate: string | undefined): candidate is LogLevel {
  return typeof candidate === "string" && (KNOWN_LEVELS as string[]).includes(candidate);
}

export function read_logger_env(
  env: NodeJS.ProcessEnv = process.env,
): LoggerEnvConfig {
  const raw_level = env.LOG_LEVEL?.toLowerCase();
  const level: LogLevel = is_known_level(raw_level) ? raw_level : "info";
  const log_dir = env.LOG_DIR ?? "./logs";
  const log_to_file = env.LOG_TO_FILE !== "false";
  const pretty = env.LOG_PRETTY === "true";

  return { level, log_dir, log_to_file, pretty };
}

interface Sink {
  write(line: string): void;
  close(): Promise<void>;
}

class StdoutSink implements Sink {
  constructor(private readonly pretty: boolean) {}

  write(line: string): void {
    if (!this.pretty) {
      process.stdout.write(line);
      return;
    }

    try {
      const parsed = JSON.parse(line.trimEnd()) as Record<string, unknown>;
      const level = typeof parsed.level === "string" ? parsed.level.toUpperCase() : "INFO";
      const time = typeof parsed.time === "string" ? parsed.time : "";
      const service = typeof parsed.service === "string" ? parsed.service : "";
      const component = typeof parsed.component === "string" ? `:${parsed.component}` : "";
      const msg = typeof parsed.msg === "string" ? parsed.msg : "";
      const scalar_exclude = new Set([
        "level", "time", "service", "component", "msg",
      ]);
      const extras: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (scalar_exclude.has(k)) continue;
        extras[k] = v;
      }
      const extras_text =
        Object.keys(extras).length === 0 ? "" : ` ${JSON.stringify(extras)}`;
      process.stdout.write(
        `[${time}] ${level} ${service}${component} ${msg}${extras_text}\n`,
      );
    } catch {
      process.stdout.write(line);
    }
  }

  async close(): Promise<void> {
    // stdout is owned by the process; do not close.
  }
}

class FileSink implements Sink {
  private readonly stream: WriteStream;

  constructor(readonly path: string) {
    this.stream = createWriteStream(path, { flags: "a" });
    // Swallow file-stream errors so a broken disk never crashes the service.
    this.stream.on("error", () => {
      /* best-effort file logging */
    });
  }

  write(line: string): void {
    try {
      this.stream.write(line);
    } catch {
      /* best-effort file logging */
    }
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.stream.end(() => resolve());
    });
  }
}

function build_sinks(config: LoggerSinkConfig): Sink[] {
  const sinks: Sink[] = [new StdoutSink(config.pretty)];

  if (!config.log_to_file) {
    return sinks;
  }

  try {
    const absolute_dir = resolve_path(config.log_dir);
    mkdirSync(absolute_dir, { recursive: true });
    const file_path = join_path(absolute_dir, config.filename);
    sinks.push(new FileSink(file_path));
  } catch {
    // Directory creation failed — continue with stdout-only logging.
  }

  return sinks;
}

function serialize_error(error: Error): Record<string, unknown> {
  return {
    type: error.name || "Error",
    message: error.message,
    stack: error.stack,
    ...((): Record<string, unknown> => {
      const record: Record<string, unknown> = {};
      const err_with_code = error as Error & { code?: unknown; status?: unknown };
      if (err_with_code.code !== undefined) record.code = err_with_code.code;
      if (err_with_code.status !== undefined) record.status = err_with_code.status;
      return record;
    })(),
  };
}

/**
 * Minimal pino-compatible logger. The instance is suitable to pass as
 * Fastify's `loggerInstance` (v5) or `logger` (v4) option.
 */
export class JsonLogger {
  readonly level: LogLevel;
  readonly bindings: Record<string, unknown>;
  readonly #sinks: Sink[];

  constructor(
    sinks: Sink[],
    level: LogLevel,
    bindings: Record<string, unknown>,
  ) {
    this.#sinks = sinks;
    this.level = level;
    this.bindings = bindings;
  }

  child(
    extra_bindings: Record<string, unknown> = {},
    options?: { level?: LogLevel },
  ): JsonLogger {
    const next_level = options?.level ?? this.level;
    return new JsonLogger(this.#sinks, next_level, {
      ...this.bindings,
      ...extra_bindings,
    });
  }

  async close(): Promise<void> {
    for (const sink of this.#sinks) {
      await sink.close();
    }
  }

  silent(): void {
    /* no-op: required by pino compatibility */
  }

  trace(obj: Record<string, unknown> | string, msg?: string, ...args: unknown[]): void {
    this.#log("trace", obj, msg, args);
  }
  debug(obj: Record<string, unknown> | string, msg?: string, ...args: unknown[]): void {
    this.#log("debug", obj, msg, args);
  }
  info(obj: Record<string, unknown> | string, msg?: string, ...args: unknown[]): void {
    this.#log("info", obj, msg, args);
  }
  warn(obj: Record<string, unknown> | string, msg?: string, ...args: unknown[]): void {
    this.#log("warn", obj, msg, args);
  }
  error(obj: Record<string, unknown> | string, msg?: string, ...args: unknown[]): void {
    this.#log("error", obj, msg, args);
  }
  fatal(obj: Record<string, unknown> | string, msg?: string, ...args: unknown[]): void {
    this.#log("fatal", obj, msg, args);
  }

  #log(
    level: LogLevel,
    obj: Record<string, unknown> | string | Error | unknown,
    msg: string | undefined,
    _args: unknown[],
  ): void {
    if (LOG_LEVEL_VALUES[level] < LOG_LEVEL_VALUES[this.level]) {
      return;
    }

    let merge: Record<string, unknown> = {};
    let message: string | undefined = msg;

    if (typeof obj === "string") {
      message = obj;
    } else if (obj instanceof Error) {
      merge = { err: serialize_error(obj) };
    } else if (obj && typeof obj === "object") {
      const record = obj as Record<string, unknown>;
      if (record.err instanceof Error) {
        merge = { ...record, err: serialize_error(record.err) };
      } else {
        merge = record;
      }
    }

    const payload: Record<string, unknown> = {
      level,
      time: new Date().toISOString(),
      ...this.bindings,
      ...merge,
    };

    if (message !== undefined) {
      payload.msg = message;
    }

    const line = safe_stringify(payload) + "\n";

    for (const sink of this.#sinks) {
      sink.write(line);
    }
  }
}

/**
 * Serialize a raw Node HTTP request/response into a compact structured summary.
 * Fastify's default request-logger hook emits `{ req }` / `{ res }` where the
 * values point at the raw Node objects. Those objects contain Sockets and
 * parsers with circular references, so we detect them by shape and replace
 * with a safe summary before JSON.stringify walks into them.
 */
function serialize_node_request(req: Record<string, unknown>): Record<string, unknown> {
  const headers = (req.headers as Record<string, unknown> | undefined) ?? undefined;
  const socket = req.socket as { remoteAddress?: unknown } | undefined;
  const remote_address = socket?.remoteAddress;
  const user_agent = headers ? headers["user-agent"] : undefined;
  return {
    method: req.method,
    url: req.url,
    ...(remote_address !== undefined ? { remote_address } : {}),
    ...(user_agent !== undefined ? { user_agent } : {}),
  };
}

function serialize_node_response(res: Record<string, unknown>): Record<string, unknown> {
  return {
    status_code: (res as { statusCode?: unknown }).statusCode,
  };
}

function looks_like_node_request(value: Record<string, unknown>): boolean {
  return (
    typeof value.httpVersion === "string" &&
    typeof value.method === "string" &&
    typeof value.url === "string"
  );
}

function looks_like_node_response(value: Record<string, unknown>): boolean {
  return (
    typeof value.statusCode === "number" &&
    ("writable" in value || "finished" in value || "_header" in value)
  );
}

function safe_stringify(payload: unknown): string {
  const seen = new WeakSet<object>();

  return JSON.stringify(payload, function replacer(key, value) {
    if (typeof value === "bigint") {
      return value.toString();
    }

    if (value instanceof Error) {
      return serialize_error(value);
    }

    if (value && typeof value === "object") {
      const object_value = value as Record<string, unknown>;

      // Detect and summarize raw Node HTTP request/response objects before
      // their circular Socket/HTTPParser graph is walked.
      if (key === "req" || looks_like_node_request(object_value)) {
        return serialize_node_request(object_value);
      }

      if (key === "res" || looks_like_node_response(object_value)) {
        return serialize_node_response(object_value);
      }

      if (seen.has(object_value)) {
        return "[Circular]";
      }
      seen.add(object_value);
    }

    return value;
  });
}

export function create_logger(input: LoggerFactoryInput): JsonLogger {
  const env = input.env ?? process.env;
  const env_config = { ...read_logger_env(env), ...(input.env_config ?? {}) };
  const filename = input.filename ?? `${input.component ?? "app"}.log`;

  const sinks = build_sinks({
    log_dir: env_config.log_dir,
    filename,
    log_to_file: env_config.log_to_file,
    pretty: env_config.pretty,
  });

  const bindings: Record<string, unknown> = {
    service: input.service,
    ...(input.component ? { component: input.component } : {}),
    ...(input.bindings ?? {}),
  };

  return new JsonLogger(sinks, env_config.level, bindings);
}
