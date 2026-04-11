import { SupabaseClient } from "@supabase/supabase-js";
import { FastifyRequest } from "fastify";

import { AuthenticatedUser, USER_ROLES, UserRole } from "../domain/core";
import { UnauthorizedError } from "../errors/app-error";
import { UserRepository } from "../repositories/user-repository";

export interface AuthService {
  authenticate(request: FastifyRequest): Promise<AuthenticatedUser>;
}

export class SupabaseAuthService implements AuthService {
  constructor(
    private readonly auth_client: SupabaseClient,
    private readonly user_repository: UserRepository,
  ) {}

  async authenticate(request: FastifyRequest): Promise<AuthenticatedUser> {
    const authorization = request.headers.authorization;
    const token = extract_bearer_token(authorization);

    const { data, error } = await this.auth_client.auth.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedError("Invalid Supabase access token");
    }

    const metadata = data.user.user_metadata ?? {};
    const role = is_user_role(metadata.role) ? metadata.role : "owner";
    const full_name =
      typeof metadata.full_name === "string"
        ? metadata.full_name
        : typeof metadata.name === "string"
          ? metadata.name
          : null;

    const profile = await this.user_repository.upsert_user({
      id: data.user.id,
      email: data.user.email ?? "unknown@example.com",
      full_name,
      role,
    });

    return {
      user_id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      role: profile.role,
    };
  }
}

function extract_bearer_token(authorization?: string): string {
  if (!authorization?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing Bearer token");
  }

  return authorization.slice("Bearer ".length).trim();
}

function is_user_role(value: unknown): value is UserRole {
  return typeof value === "string" && USER_ROLES.includes(value as UserRole);
}
