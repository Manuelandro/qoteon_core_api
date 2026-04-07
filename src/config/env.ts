import { z } from "zod";

export const DEFAULT_PROMPT_LIBRARY_BASE_URL = "http://qoteon-prompt-library-agz7:3000";
export const DEFAULT_PROMPT_RUNNER_BASE_URL = "http://qoteon-prompt-runner-api:3000";

const env_schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3000),
  AUTH_MODE: z.enum(["stub", "supabase"]).default("stub"),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  PROMPT_LIBRARY_BASE_URL: z.string().url().default(DEFAULT_PROMPT_LIBRARY_BASE_URL),
  PROMPT_LIBRARY_AUTH_TOKEN: z.string().optional(),
  PROMPT_RUNNER_BASE_URL: z.string().url().default(DEFAULT_PROMPT_RUNNER_BASE_URL),
  PROMPT_RUNNER_AUTH_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof env_schema>;

export function read_env(source: NodeJS.ProcessEnv = process.env): Env {
  return env_schema.parse(source);
}
