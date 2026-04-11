import test from "node:test";
import assert from "node:assert/strict";

import { read_env } from "../src/config/env";
import { build_ssl_config, sanitize_connection_string } from "../src/db/postgres";

test("read_env maps the legacy CA path to the standardized CA file field", () => {
  const env = read_env({
    DATABASE_URL: "postgres://user:pass@db.example.com:6543/postgres",
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
