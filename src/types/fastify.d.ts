import "fastify";

import { AuthenticatedUser } from "../domain/core";

declare module "fastify" {
  interface FastifyRequest {
    current_user: AuthenticatedUser;
  }
}
