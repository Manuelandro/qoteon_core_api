import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { load_env_file_if_present, read_env } from "../src/config/env";
import { build_ssl_config, sanitize_connection_string } from "../src/db/postgres";

test("read_env maps the legacy CA path to the standardized CA file field", () => {
  const env = read_env({
    DATABASE_URL: "postgres://user:pass@db.example.com:6543/postgres",
    INTERNAL_AUTH_TOKEN: "qoteon-local-core-token",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_ANON_KEY: "test-anon-key",
    DATABASE_CA_CERT_PATH: "/tmp/core-ca.pem",
  });

  assert.equal(env.DATABASE_SSL_CA_FILE, "/tmp/core-ca.pem");
});

test("sanitize_connection_string removes SSL query params", () => {
  const result = sanitize_connection_string(
    "postgres://user:pass@db.example.com:6543/postgres?sslmode=require&sslrootcert=/tmp/root.crt",
  );

  const parsed_url = new URL(result);

  assert.equal(parsed_url.searchParams.get("sslmode"), null);
  assert.equal(parsed_url.searchParams.get("sslrootcert"), null);
});

test("build_ssl_config maps no-verify to rejectUnauthorized=false", () => {
  const ssl_config = build_ssl_config({
    ssl_mode: "no-verify",
  });

  assert.ok(ssl_config && typeof ssl_config !== "boolean");
  assert.equal(ssl_config.rejectUnauthorized, false);
});

test("build_ssl_config maps verify-full to rejectUnauthorized=true", () => {
  const ssl_config = build_ssl_config({
    ssl_mode: "verify-full",
  });

  assert.ok(ssl_config && typeof ssl_config !== "boolean");
  assert.equal(ssl_config.rejectUnauthorized, true);
});

test("load_env_file_if_present loads dotenv-style values into process.env", () => {
  const temp_directory = mkdtempSync(join(tmpdir(), "qoteon-core-env-"));
  const env_file_path = join(temp_directory, ".env");
  const env_key = "QOTEON_CORE_TEST_ENV_LOADED";
  const previous_value = process.env[env_key];

  writeFileSync(env_file_path, `${env_key}=loaded-from-file\n`, "utf8");
  delete process.env[env_key];

  try {
    load_env_file_if_present(env_file_path);
    assert.equal(process.env[env_key], "loaded-from-file");
  } finally {
    if (previous_value === undefined) {
      delete process.env[env_key];
    } else {
      process.env[env_key] = previous_value;
    }

    rmSync(temp_directory, {
      force: true,
      recursive: true,
    });
  }
});
