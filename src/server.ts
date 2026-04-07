import { build_app } from "./app";
import { read_env } from "./config/env";

async function start(): Promise<void> {
  const env = read_env();
  const app = build_app({
    env,
    logger: true,
  });

  try {
    await app.listen({
      host: env.HOST,
      port: env.PORT,
    });
  } catch (error) {
    app.log.error(error);
    process.exitCode = 1;
  }
}

void start();
