import fs from "node:fs";
import type { ConnectionOptions } from "node:tls";

import { Pool, type PoolClient, type PoolConfig } from "pg";

import { AppError, ConflictError } from "../errors/app-error";

type DatabaseSslMode =
  | "disable"
  | "allow"
  | "prefer"
  | "require"
  | "verify-ca"
  | "verify-full"
  | "no-verify";

interface CreateDatabasePoolOptions {
  connection_string: string;
  ssl_mode?: DatabaseSslMode;
  ssl_ca_file?: string;
  ssl_cert_file?: string;
  ssl_key_file?: string;
}

interface DatabaseCertificateFileOptions {
  ssl_ca_file?: string;
  ssl_cert_file?: string;
  ssl_key_file?: string;
}

const SSL_QUERY_PARAMS = ["ssl", "sslcert", "sslkey", "sslmode", "sslrootcert", "uselibpqcompat"];

function read_file_if_present(file_path: string | undefined): string | undefined {
  if (!file_path) {
    return undefined;
  }

  return fs.readFileSync(file_path, "utf8");
}

function load_client_certificate_options(input: DatabaseCertificateFileOptions): Pick<
  ConnectionOptions,
  "ca" | "cert" | "key"
> {
  return {
    ca: read_file_if_present(input.ssl_ca_file),
    cert: read_file_if_present(input.ssl_cert_file),
    key: read_file_if_present(input.ssl_key_file),
  };
}

/**
 * PostgreSQL libpq sslmode semantics do not map 1:1 onto node-postgres.
 * For this service:
 * - disable => plain connection
 * - require / no-verify / allow / prefer => TLS without CA validation
 * - verify-ca / verify-full => TLS with CA validation
 */
export function build_ssl_config(input: {
  ssl_mode: DatabaseSslMode;
  ssl_ca_file?: string;
  ssl_cert_file?: string;
  ssl_key_file?: string;
}): PoolConfig["ssl"] | undefined {
  const certificate_options = load_client_certificate_options(input);

  if (input.ssl_mode === "disable") {
    return undefined;
  }

  if (["require", "no-verify", "allow", "prefer"].includes(input.ssl_mode)) {
    return {
      ...certificate_options,
      rejectUnauthorized: false,
    };
  }

  return {
    ...certificate_options,
    rejectUnauthorized: true,
  };
}

export function sanitize_connection_string(connection_string: string): string {
  try {
    const parsed_url = new URL(connection_string);

    for (const parameter of SSL_QUERY_PARAMS) {
      parsed_url.searchParams.delete(parameter);
    }

    return parsed_url.toString();
  } catch {
    return connection_string;
  }
}

export function create_database_pool(input: CreateDatabasePoolOptions): Pool {
  return new Pool({
    connectionString: sanitize_connection_string(input.connection_string),
    ssl: build_ssl_config({
      ssl_mode: input.ssl_mode ?? "no-verify",
      ...(input.ssl_ca_file ? { ssl_ca_file: input.ssl_ca_file } : {}),
      ...(input.ssl_cert_file ? { ssl_cert_file: input.ssl_cert_file } : {}),
      ...(input.ssl_key_file ? { ssl_key_file: input.ssl_key_file } : {}),
    }),
    max: 10,
  });
}

export async function with_transaction<T>(
  pool: Pool,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function throw_postgres_error(
  error: { message?: string; code?: string; detail?: string | null } | null,
  fallback_message: string,
): never {
  if (error?.code === "23505") {
    throw new ConflictError(fallback_message, {
      database_code: error.code,
      database_details: error.detail ?? undefined,
    });
  }

  throw new AppError(fallback_message, {
    status_code: 500,
    code: "database_error",
    expose: false,
    details: {
      database_code: error?.code,
      database_message: error?.message,
      database_details: error?.detail,
    },
  });
}

export function to_iso_string(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
