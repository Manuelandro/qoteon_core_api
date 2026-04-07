import { createClient, SupabaseClient } from "@supabase/supabase-js";

import { Env } from "../config/env";
import { AppError, ConflictError } from "../errors/app-error";

export function create_supabase_admin_client(env: Env): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new AppError("Supabase admin credentials are not configured", {
      status_code: 500,
      code: "missing_supabase_admin_config",
      expose: true,
    });
  }

  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function create_supabase_auth_client(env: Env): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new AppError("Supabase auth credentials are not configured", {
      status_code: 500,
      code: "missing_supabase_auth_config",
      expose: true,
    });
  }

  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function throw_supabase_error(
  error: { message?: string; code?: string; details?: string | null } | null,
  fallback_message: string,
): never {
  if (error?.code === "23505") {
    throw new ConflictError(fallback_message, {
      database_code: error.code,
      database_details: error.details ?? undefined,
    });
  }

  throw new AppError(fallback_message, {
    status_code: 500,
    code: "database_error",
    expose: false,
    details: {
      database_code: error?.code,
      database_message: error?.message,
      database_details: error?.details,
    },
  });
}
