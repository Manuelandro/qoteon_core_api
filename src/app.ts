import Fastify, { FastifyInstance } from "fastify";

import { read_env, Env } from "./config/env";
import { AppError } from "./errors/app-error";
import { create_app_runtime, AppServices } from "./build-services";
import { register_health_routes } from "./routes/health-routes";
import { register_organization_routes } from "./routes/organization-routes";
import { register_overview_routes } from "./routes/overview-routes";
import { register_project_routes } from "./routes/project-routes";
import { register_workflow_routes } from "./routes/workflow-routes";

export interface BuildAppOptions {
  close_runtime?: () => Promise<void>;
  env?: Env;
  logger?: boolean;
  services?: AppServices;
}

export function build_app(options: BuildAppOptions = {}): FastifyInstance {
  const env = options.env ?? read_env();
  const runtime = options.services ? null : create_app_runtime(env);
  const services = options.services ?? runtime!.services;

  const app = Fastify({
    logger: options.logger ?? false,
  });

  const close_runtime = options.close_runtime ?? runtime?.close;

  if (close_runtime) {
    app.addHook("onClose", async () => {
      await close_runtime();
    });
  }

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.status_code).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details ?? null,
        },
      });
    }

    request.log.error(error);
    return reply.status(500).send({
      error: {
        code: "internal_server_error",
        message: "An unexpected error occurred",
      },
    });
  });

  void register_health_routes(app);

  app.register(async (protected_app) => {
    protected_app.addHook("preHandler", async (request) => {
      request.current_user = await services.auth_service.authenticate(request);
    });

    await register_organization_routes(protected_app, services);
    await register_project_routes(protected_app, services);
    await register_workflow_routes(protected_app, services);
    await register_overview_routes(protected_app, services);
  });

  return app;
}
