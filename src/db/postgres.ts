import fs from "node:fs";

import { Pool, type PoolClient, type PoolConfig } from "pg";

import { AppError, ConflictError } from "../errors/app-error";

type DatabaseSslMode = "disable" | "require" | "no-verify";

interface CreateDatabasePoolOptions {
  connection_string: string;
  ssl_mode?: DatabaseSslMode;
  ca_cert_path?: string;
}

const SSL_QUERY_PARAMS = ["ssl", "sslcert", "sslkey", "sslmode", "sslrootcert", "uselibpqcompat"];

function build_ssl_config(input: {
  ssl_mode: DatabaseSslMode;
  ca_cert_path?: string;
}): PoolConfig["ssl"] | undefined {
  if (input.ssl_mode === "disable") {
    return undefined;
  }

  if (input.ssl_mode === "no-verify") {
    return {
      rejectUnauthorized: false,
    };
  }

  if (input.ca_cert_path) {
    return {
      rejectUnauthorized: true,
      ca: fs.readFileSync(input.ca_cert_path, "utf8"),
    };
  }

  return {
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
      ...(input.ca_cert_path ? { ca_cert_path: input.ca_cert_path } : {}),
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
