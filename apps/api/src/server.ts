import { buildApp } from "./app.js";

const app = await buildApp();

let shutdownPromise: Promise<void> | undefined;

function shutdown(signal: string): Promise<void> {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  shutdownPromise = (async () => {
    app.log.info({ signal }, "Shutting down API");

    try {
      await app.close();
      app.log.info("API shutdown complete");
    } catch (error) {
      app.log.error({ err: error }, "API shutdown failed");
      process.exitCode = 1;
    }
  })();

  return shutdownPromise;
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

try {
  await app.listen({
    port: Number(process.env.API_PORT ?? 4000),
    host: "0.0.0.0",
  });
} catch (error) {
  app.log.error({ err: error }, "API startup failed");
  await shutdown("startup failure");
  process.exitCode = 1;
}
