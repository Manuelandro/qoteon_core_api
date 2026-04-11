import { AuthenticatedUser } from "../domain/core";

export type AccessActor = Pick<AuthenticatedUser, "user_id" | "role"> | string;

export function resolve_access_actor(actor: AccessActor): Pick<AuthenticatedUser, "user_id" | "role"> {
  if (typeof actor === "string") {
    return {
      user_id: actor,
      role: "owner",
    };
  }

  return actor;
}
