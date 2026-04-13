import Fastify, { FastifyInstance } from "fastify";

import { read_env, Env } from "./config/env";
import { AppError, UnauthorizedError } from "./errors/app-error";
import { create_app_runtime, AppServices } from "./build-services";
import {
  PublicEdgeAdmissionToken,
  PublicEdgeGuard,
  should_skip_public_edge_guard,
} from "./lib/public-edge-guard";
import { register_admin_daily_runner_routes } from "./routes/admin-daily-runner-routes";
import { register_health_routes } from "./routes/health-routes";
import { register_admin_reconciliation_routes } from "./routes/admin-reconciliation-routes";
import { register_internal_workflow_routes } from "./routes/internal-workflow-routes";
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
  const app = Fastify({
    logger: options.logger ?? false,
    trustProxy: env.CORE_TRUST_PROXY,
    disableRequestLogging: true,
  });
  const runtime = options.services ? null : create_app_runtime(env, app.log);
  const services = options.services ?? runtime!.services;
  const public_edge_guard = new PublicEdgeGuard({
    rate_limit_window_ms: env.CORE_RATE_LIMIT_WINDOW_MS,
    rate_limit_default_max: env.CORE_RATE_LIMIT_DEFAULT_MAX,
    rate_limit_project_create_max: env.CORE_RATE_LIMIT_PROJECT_CREATE_MAX,
    rate_limit_run_launch_max: env.CORE_RATE_LIMIT_RUN_LAUNCH_MAX,
    rate_limit_crawl_trigger_max: env.CORE_RATE_LIMIT_CRAWL_TRIGGER_MAX,
    max_in_flight_requests: env.CORE_BACKPRESSURE_MAX_IN_FLIGHT,
    max_in_flight_critical_requests: env.CORE_BACKPRESSURE_MAX_IN_FLIGHT_CRITICAL,
  });
  const admission_tokens = new WeakMap<object, PublicEdgeAdmissionToken>();

  const close_runtime = options.close_runtime ?? runtime?.close;

  if (close_runtime) {
    app.addHook("onClose", async () => {
      await close_runtime();
    });
  }

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      const retry_after_seconds =
        typeof error.details?.retry_after_seconds === "number"
          ? error.details.retry_after_seconds
          : null;

      if (error.status_code === 429 && retry_after_seconds !== null) {
        reply.header("retry-after", String(retry_after_seconds));
      }

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

  app.register(async (internal_app) => {
    internal_app.addHook("preHandler", async (request) => {
      const authorization = request.headers.authorization;

      if (authorization !== `Bearer ${env.INTERNAL_AUTH_TOKEN}`) {
        throw new UnauthorizedError("Invalid internal auth token");
      }
    });

    await register_internal_workflow_routes(internal_app, services);
  }, { prefix: "/internal" });

  app.addHook("onRequest", async (request) => {
    request.log.info(
      {
        request_id: request.id,
        method: request.method,
        url: request.url,
        remote_ip: request.ip,
      },
      "Incoming request to Core API",
    );

    if (should_skip_public_edge_guard(request.method, request.url)) {
      return;
    }

    const token = public_edge_guard.enter({
      method: request.method,
      path: request.url,
      ip: request.ip,
    });

    admission_tokens.set(request, token);
  });

  app.addHook("onResponse", async (request, reply) => {
    const token = admission_tokens.get(request);

    request.log.info(
      {
        request_id: request.id,
        method: request.method,
        url: request.url,
        status_code: reply.statusCode,
        user_id: request.current_user?.user_id,
        user_role: request.current_user?.role,
      },
      "Response sent by Core API",
    );

    if (!token) {
      return;
    }

    public_edge_guard.leave(token);
    admission_tokens.delete(request);
  });

  app.register(async (protected_app) => {
    protected_app.addHook("preHandler", async (request) => {
      request.current_user = await services.auth_service.authenticate(request);
    });

    await register_organization_routes(protected_app, services);
    await register_project_routes(protected_app, services);
    await register_workflow_routes(protected_app, services);
    await register_overview_routes(protected_app, services);
    await register_admin_reconciliation_routes(protected_app, services);
    await register_admin_daily_runner_routes(protected_app, services);
  });

  return app;
}
