import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  JsonLogger,
  create_logger,
  read_logger_env,
  redact_sensitive_headers,
  truncate_log_text,
} from "../src/lib/logger";

test("read_logger_env defaults to info level, file logging on, pretty off", () => {
  const config = read_logger_env({});
  assert.equal(config.level, "info");
  assert.equal(config.log_to_file, true);
  assert.equal(config.pretty, false);
  assert.equal(config.log_dir, "./logs");
});

test("read_logger_env parses all env vars", () => {
  const config = read_logger_env({
    LOG_LEVEL: "debug",
    LOG_TO_FILE: "false",
    LOG_DIR: "/tmp/foo",
    LOG_PRETTY: "true",
  });
  assert.equal(config.level, "debug");
  assert.equal(config.log_to_file, false);
  assert.equal(config.pretty, true);
  assert.equal(config.log_dir, "/tmp/foo");
});

test("read_logger_env falls back to info for unknown levels", () => {
  const config = read_logger_env({ LOG_LEVEL: "nonsense" });
  assert.equal(config.level, "info");
});

test("create_logger writes JSON lines to a file sink", async () => {
  const dir = mkdtempSync(join(tmpdir(), "qoteon-logger-"));
  try {
    const logger = create_logger({
      service: "test_service",
      component: "api",
      filename: "api.log",
      env_config: { level: "info", log_dir: dir, log_to_file: true, pretty: false },
    });
    logger.info({ event_type: "unit_test", project_id: "proj-1" }, "hello");
    await logger.close();

    const path = join(dir, "api.log");
    assert.ok(existsSync(path), "file should be created");
    const contents = readFileSync(path, "utf8").trim();
    const line = contents.split("\n")[0];
    const parsed = JSON.parse(line!) as Record<string, unknown>;
    assert.equal(parsed.level, "info");
    assert.equal(parsed.service, "test_service");
    assert.equal(parsed.component, "api");
    assert.equal(parsed.event_type, "unit_test");
    assert.equal(parsed.project_id, "proj-1");
    assert.equal(parsed.msg, "hello");
    assert.ok(typeof parsed.time === "string");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("create_logger skips file sink when log_to_file is false", async () => {
  const dir = mkdtempSync(join(tmpdir(), "qoteon-logger-"));
  try {
    const logger = create_logger({
      service: "test_service",
      component: "api",
      filename: "api.log",
      env_config: { level: "info", log_dir: dir, log_to_file: false, pretty: false },
    });
    logger.info("test");
    await logger.close();
    assert.equal(existsSync(join(dir, "api.log")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("JsonLogger.child inherits bindings and merges new ones", async () => {
  const dir = mkdtempSync(join(tmpdir(), "qoteon-logger-"));
  try {
    const root = create_logger({
      service: "svc",
      component: "api",
      env_config: { level: "info", log_dir: dir, log_to_file: true, pretty: false },
    });
    const child = root.child({ project_id: "p-1" });
    const grandchild = child.child({ step: "generate" });
    grandchild.info({ event_type: "x" }, "scoped");
    await root.close();

    const path = join(dir, "api.log");
    const parsed = JSON.parse(readFileSync(path, "utf8").trim().split("\n").pop()!) as Record<string, unknown>;
    assert.equal(parsed.service, "svc");
    assert.equal(parsed.project_id, "p-1");
    assert.equal(parsed.step, "generate");
    assert.equal(parsed.msg, "scoped");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("JsonLogger drops entries below configured level", async () => {
  const dir = mkdtempSync(join(tmpdir(), "qoteon-logger-"));
  try {
    const logger = create_logger({
      service: "svc",
      component: "api",
      env_config: { level: "warn", log_dir: dir, log_to_file: true, pretty: false },
    });
    logger.info("should be skipped");
    logger.warn("should appear");
    await logger.close();
    const lines = readFileSync(join(dir, "api.log"), "utf8").trim().split("\n");
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]!).msg, "should appear");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("JsonLogger serializes Error instances with stack and message", async () => {
  const dir = mkdtempSync(join(tmpdir(), "qoteon-logger-"));
  try {
    const logger = create_logger({
      service: "svc",
      component: "api",
      env_config: { level: "info", log_dir: dir, log_to_file: true, pretty: false },
    });
    const err = new Error("boom");
    logger.error({ event_type: "failed", err }, "kaboom");
    await logger.close();
    const parsed = JSON.parse(readFileSync(join(dir, "api.log"), "utf8").trim()) as Record<string, unknown>;
    const errField = parsed.err as Record<string, unknown>;
    assert.equal(errField.message, "boom");
    assert.equal(errField.type, "Error");
    assert.ok(typeof errField.stack === "string");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("redact_sensitive_headers replaces Authorization and cookie values", () => {
  const redacted = redact_sensitive_headers({
    authorization: "Bearer sk-secret-token",
    "x-api-key": "my-key",
    cookie: "session=abc",
    "user-agent": "Mozilla",
    "content-type": "application/json",
  });
  assert.equal(redacted?.authorization, "[REDACTED]");
  assert.equal(redacted?.["x-api-key"], "[REDACTED]");
  assert.equal(redacted?.cookie, "[REDACTED]");
  assert.equal(redacted?.["user-agent"], "Mozilla");
  assert.equal(redacted?.["content-type"], "application/json");
});

test("redact_sensitive_headers is case-insensitive", () => {
  const redacted = redact_sensitive_headers({
    Authorization: "Bearer foo",
    "X-API-KEY": "bar",
  });
  assert.equal(redacted?.Authorization, "[REDACTED]");
  assert.equal(redacted?.["X-API-KEY"], "[REDACTED]");
});

test("truncate_log_text appends a truncation marker for oversized fields", () => {
  const long = "a".repeat(5000);
  const truncated = truncate_log_text(long, 100);
  assert.ok(truncated);
  assert.ok(truncated!.length < long.length);
  assert.match(truncated as string, /truncated:5000/);
});

test("truncate_log_text passes short strings through untouched", () => {
  assert.equal(truncate_log_text("short", 100), "short");
  assert.equal(truncate_log_text(null), null);
  assert.equal(truncate_log_text(undefined), undefined);
});

test("JsonLogger handles circular references without crashing", async () => {
  const dir = mkdtempSync(join(tmpdir(), "qoteon-logger-"));
  try {
    const logger = create_logger({
      service: "svc",
      component: "api",
      env_config: { level: "info", log_dir: dir, log_to_file: true, pretty: false },
    });
    const circular: Record<string, unknown> = { id: "x" };
    circular.self = circular;
    logger.info({ event_type: "loop", payload: circular }, "cyclic");
    await logger.close();

    const line = readFileSync(join(dir, "api.log"), "utf8").trim();
    const parsed = JSON.parse(line) as Record<string, unknown>;
    assert.equal(parsed.msg, "cyclic");
    const payload = parsed.payload as Record<string, unknown>;
    assert.equal(payload.id, "x");
    assert.equal(payload.self, "[Circular]");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("JsonLogger summarizes raw Node HTTP request/response objects", async () => {
  const dir = mkdtempSync(join(tmpdir(), "qoteon-logger-"));
  try {
    const logger = create_logger({
      service: "svc",
      component: "api",
      env_config: { level: "info", log_dir: dir, log_to_file: true, pretty: false },
    });
    // Construct a request-like object whose Socket points back at itself,
    // which is exactly the circular shape Fastify's raw req carries.
    const socket: Record<string, unknown> = { remoteAddress: "127.0.0.1" };
    socket.parser = { socket };
    const req: Record<string, unknown> = {
      httpVersion: "1.1",
      method: "GET",
      url: "/internal/foo",
      headers: { "user-agent": "curl/8" },
      socket,
    };
    const res: Record<string, unknown> = {
      statusCode: 200,
      writable: true,
      req,
    };

    logger.info({ req, res }, "incoming request");
    await logger.close();

    const parsed = JSON.parse(readFileSync(join(dir, "api.log"), "utf8").trim()) as Record<string, unknown>;
    const req_field = parsed.req as Record<string, unknown>;
    assert.equal(req_field.method, "GET");
    assert.equal(req_field.url, "/internal/foo");
    assert.equal(req_field.remote_address, "127.0.0.1");
    assert.equal(req_field.user_agent, "curl/8");
    const res_field = parsed.res as Record<string, unknown>;
    assert.equal(res_field.status_code, 200);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("JsonLogger exports match the expected pino-like interface", () => {
  const logger = new JsonLogger([], "info", {});
  assert.equal(typeof logger.info, "function");
  assert.equal(typeof logger.warn, "function");
  assert.equal(typeof logger.error, "function");
  assert.equal(typeof logger.debug, "function");
  assert.equal(typeof logger.trace, "function");
  assert.equal(typeof logger.fatal, "function");
  assert.equal(typeof logger.silent, "function");
  assert.equal(typeof logger.child, "function");
  assert.equal(logger.level, "info");
});
