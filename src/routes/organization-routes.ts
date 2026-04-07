import { FastifyInstance } from "fastify";

import { AppServices } from "../build-services";
import { parse_schema } from "../lib/validation";
import {
  create_organization_request_schema,
} from "../schemas/organization-schemas";

export async function register_organization_routes(
  app: FastifyInstance,
  services: AppServices,
): Promise<void> {
  app.get("/organizations", async (request) => {
    const organizations = await services.organization_service.list_organizations_for_user(
      request.current_user.user_id,
    );

    return { organizations };
  });

  app.post("/organizations", async (request, reply) => {
    const body = parse_schema(create_organization_request_schema, request.body);
    const organization = await services.organization_service.create_organization_for_user(
      request.current_user,
      {
        name: body.name,
        slug: body.slug,
        plan_type: body.plan_type ?? "starter",
      },
    );

    return reply.code(201).send(organization);
  });
}
