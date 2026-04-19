import { build_app } from "./app";
import { read_env } from "./config/env";
import { create_logger } from "./lib/logger";

async function start(): Promise<void> {
  const env = read_env();
  const logger = create_logger({
    service: "qoteon_core_api",
    component: "api",
    filename: "api.log",
  });
  const app = build_app({
    env,
    logger,
  });

  try {
    logger.info(
      { event_type: "service_startup", host: env.HOST, port: env.PORT },
      "Core API service starting",
    );
    await app.listen({
      host: env.HOST,
      port: env.PORT,
    });

    const shutdown = async () => {
      logger.info({ event_type: "service_shutdown" }, "Core API service shutting down");
      await app.close();
      await logger.close();
      process.exit(0);
    };

    process.on("SIGINT", () => {
      void shutdown();
    });

    process.on("SIGTERM", () => {
      void shutdown();
    });
  } catch (error) {
    logger.error(
      { event_type: "service_startup_failed", err: error instanceof Error ? error : new Error(String(error)) },
      "Core API failed to start",
    );
    process.exitCode = 1;
  }
}

void start();
