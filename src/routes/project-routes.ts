import { FastifyInstance } from "fastify";
import { z } from "zod";

import { AppServices } from "../build-services";
import { parse_schema } from "../lib/validation";
import {
  competitor_create_request_schema,
  competitor_update_request_schema,
  list_projects_query_schema,
  project_create_request_schema,
  project_update_request_schema,
} from "../schemas/project-schemas";

const project_params_schema = z.object({
  project_id: z.string().min(1),
});

const competitor_params_schema = z.object({
  project_id: z.string().min(1),
  competitor_id: z.string().min(1),
});

export async function register_project_routes(
  app: FastifyInstance,
  services: AppServices,
): Promise<void> {
  app.post("/projects", async (request, reply) => {
    const body = parse_schema(project_create_request_schema, request.body);
    const result = await services.orchestration_service.setup_project(
      request.current_user,
      body,
    );

    return reply.code(201).send(result);
  });

  app.get("/projects", async (request) => {
    const query = parse_schema(list_projects_query_schema, request.query);
    const projects = await services.project_service.list_projects(request.current_user, query);

    return { projects };
  });

  app.get("/projects/:project_id", async (request) => {
    const params = parse_schema(project_params_schema, request.params);
    return services.project_service.get_project(request.current_user, params.project_id);
  });

  app.patch("/projects/:project_id", async (request) => {
    const params = parse_schema(project_params_schema, request.params);
    const body = parse_schema(project_update_request_schema, request.body);

    return services.orchestration_service.update_project(
      request.current_user,
      params.project_id,
      body,
    );
  });

  app.post("/projects/:project_id/competitors", async (request, reply) => {
    const params = parse_schema(project_params_schema, request.params);
    const body = parse_schema(competitor_create_request_schema, request.body);
    const competitor = await services.project_service.create_competitor(
      request.current_user,
      params.project_id,
      body,
    );

    return reply.code(201).send(competitor);
  });

  app.post("/projects/:project_id/competitors/prefill", async (request) => {
    const params = parse_schema(project_params_schema, request.params);

    return services.orchestration_service.prefill_project_competitors(
      request.current_user,
      params.project_id,
    );
  });

  app.post("/projects/:project_id/competitors/bootstrap", async (request) => {
    const params = parse_schema(project_params_schema, request.params);

    return services.orchestration_service.bootstrap_project_competitors(
      request.current_user,
      params.project_id,
    );
  });

  app.get("/projects/:project_id/competitors", async (request) => {
    const params = parse_schema(project_params_schema, request.params);
    const competitors = await services.project_service.list_competitors(
      request.current_user,
      params.project_id,
    );

    return { competitors };
  });

  app.patch("/projects/:project_id/competitors/:competitor_id", async (request) => {
    const params = parse_schema(competitor_params_schema, request.params);
    const body = parse_schema(competitor_update_request_schema, request.body);

    return services.project_service.update_competitor(
      request.current_user,
      params.project_id,
      params.competitor_id,
      body,
    );
  });

  app.delete("/projects/:project_id/competitors/:competitor_id", async (request, reply) => {
    const params = parse_schema(competitor_params_schema, request.params);

    await services.project_service.delete_competitor(
      request.current_user,
      params.project_id,
      params.competitor_id,
    );

    return reply.code(204).send();
  });
}
