import { buildApp } from "./app.js";

const app = await buildApp();

try {
  await app.listen({
    port: Number(process.env.API_PORT ?? 4000),
    host: "0.0.0.0",
  });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
