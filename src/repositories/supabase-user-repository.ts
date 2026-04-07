import { SupabaseClient } from "@supabase/supabase-js";

import { User } from "../domain/core";
import { throw_supabase_error } from "../lib/supabase";
import { UpsertUserInput, UserRepository } from "./user-repository";

export class SupabaseUserRepository implements UserRepository {
  constructor(private readonly client: SupabaseClient) {}

  async upsert_user(input: UpsertUserInput): Promise<User> {
    const { data, error } = await this.client
      .from("users")
      .upsert(
        {
          id: input.id,
          email: input.email,
          full_name: input.full_name,
          role: input.role,
        },
        { onConflict: "id" },
      )
      .select("*")
      .single();

    if (error || !data) {
      throw_supabase_error(error, "Unable to upsert user profile");
    }

    return data as User;
  }

  async get_user_by_id(user_id: string): Promise<User | null> {
    const { data, error } = await this.client.from("users").select("*").eq("id", user_id).maybeSingle();

    if (error) {
      throw_supabase_error(error, "Unable to load user profile");
    }

    return (data as User | null) ?? null;
  }
}
