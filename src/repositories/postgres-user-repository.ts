import { type Pool } from "pg";

import { User } from "../domain/core";
import { throw_postgres_error, to_iso_string } from "../db/postgres";
import { UpsertUserInput, UserRepository } from "./user-repository";

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: User["role"];
  created_at: Date | string;
  updated_at: Date | string;
}

export class PostgresUserRepository implements UserRepository {
  constructor(private readonly pool: Pool) {}

  async upsert_user(input: UpsertUserInput): Promise<User> {
    try {
      const result = await this.pool.query<UserRow>(
        `
          INSERT INTO public.core_users (
            id,
            email,
            full_name,
            role
          )
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (id)
          DO UPDATE SET
            email = EXCLUDED.email,
            full_name = EXCLUDED.full_name,
            role = EXCLUDED.role,
            updated_at = timezone('utc', now())
          RETURNING *
        `,
        [input.id, input.email, input.full_name, input.role],
      );

      const row = result.rows[0];

      if (!row) {
        throw new Error("Failed to upsert user profile");
      }

      return map_user(row);
    } catch (error) {
      throw_postgres_error(as_postgres_error(error), "Unable to upsert user profile");
    }
  }

  async get_user_by_id(user_id: string): Promise<User | null> {
    try {
      const result = await this.pool.query<UserRow>(
        `SELECT * FROM public.core_users WHERE id = $1 LIMIT 1`,
        [user_id],
      );

      const row = result.rows[0];
      return row ? map_user(row) : null;
    } catch (error) {
      throw_postgres_error(as_postgres_error(error), "Unable to load user profile");
    }
  }
}

function map_user(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    role: row.role,
    created_at: to_iso_string(row.created_at),
    updated_at: to_iso_string(row.updated_at),
  };
}

function as_postgres_error(error: unknown): { message?: string; code?: string; detail?: string | null } | null {
  if (error && typeof error === "object") {
    const candidate = error as { message?: string; code?: string; detail?: string | null };
    return candidate;
  }

  return null;
}
