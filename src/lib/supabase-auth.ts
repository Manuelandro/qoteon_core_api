import { createClient, SupabaseClient } from "@supabase/supabase-js";

import { Env } from "../config/env";
import { AppError } from "../errors/app-error";

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
