import { User, UserRole } from "../domain/core";

export interface UpsertUserInput {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
}

export interface UserRepository {
  upsert_user(input: UpsertUserInput): Promise<User>;
  get_user_by_id(user_id: string): Promise<User | null>;
}
