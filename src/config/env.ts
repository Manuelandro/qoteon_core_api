import { z } from "zod";

export const DEFAULT_PROMPT_LIBRARY_BASE_URL = "http://qoteon-prompt-library:3000";
export const DEFAULT_PROMPT_RUNNER_BASE_URL = "http://qoteon-prompt-runner-api:3000";
export const DEFAULT_SOURCE_INTELLIGENCE_BASE_URL = "http://qoteon-source-intelligence-api:3000";
export const DEFAULT_DASHBOARD_LAYER_BASE_URL = "http://qoteon-dashboard-layer:4020";

const env_schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3000),
  CORE_TRUST_PROXY: z.coerce.boolean().default(true),
  AUTH_MODE: z.enum(["stub", "supabase"]).default("stub"),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL_MODE: z.enum(["disable", "require", "no-verify"]).default("no-verify"),
  DATABASE_CA_CERT_PATH: z.string().min(1).optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  PROMPT_LIBRARY_BASE_URL: z.string().url().default(DEFAULT_PROMPT_LIBRARY_BASE_URL),
  PROMPT_LIBRARY_AUTH_TOKEN: z.string().optional(),
  PROMPT_RUNNER_BASE_URL: z.string().url().default(DEFAULT_PROMPT_RUNNER_BASE_URL),
  PROMPT_RUNNER_AUTH_TOKEN: z.string().optional(),
  SOURCE_INTELLIGENCE_BASE_URL: z.string().url().default(DEFAULT_SOURCE_INTELLIGENCE_BASE_URL),
  SOURCE_INTELLIGENCE_AUTH_TOKEN: z.string().optional(),
  DASHBOARD_LAYER_BASE_URL: z.string().url().default(DEFAULT_DASHBOARD_LAYER_BASE_URL),
  DASHBOARD_LAYER_AUTH_TOKEN: z.string().optional(),
  CORE_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  CORE_RATE_LIMIT_DEFAULT_MAX: z.coerce.number().int().positive().default(240),
  CORE_RATE_LIMIT_PROJECT_CREATE_MAX: z.coerce.number().int().positive().default(20),
  CORE_RATE_LIMIT_RUN_LAUNCH_MAX: z.coerce.number().int().positive().default(30),
  CORE_RATE_LIMIT_CRAWL_TRIGGER_MAX: z.coerce.number().int().positive().default(30),
  CORE_BACKPRESSURE_MAX_IN_FLIGHT: z.coerce.number().int().positive().default(120),
  CORE_BACKPRESSURE_MAX_IN_FLIGHT_CRITICAL: z.coerce.number().int().positive().default(24),
  CORE_IDEMPOTENCY_EXPLICIT_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
  CORE_IDEMPOTENCY_IMPLICIT_TTL_SECONDS: z.coerce.number().int().positive().default(45),
  CORE_IDEMPOTENCY_REQUIRE_HEADER: z.coerce.boolean().default(false),
});

export type Env = z.infer<typeof env_schema>;

export function read_env(source: NodeJS.ProcessEnv = process.env): Env {
  return env_schema.parse(source);
}
