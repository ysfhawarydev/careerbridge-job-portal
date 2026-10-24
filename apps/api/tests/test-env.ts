import { config } from "dotenv";
import { fileURLToPath } from "node:url";

config({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
});

const TEST_DATABASE_URL =
  "postgres://portal:portal@127.0.0.1:55432/portal_test";

const url = new URL(TEST_DATABASE_URL);

if (
  url.hostname !== "127.0.0.1" ||
  url.port !== "55432" ||
  url.pathname !== "/portal_test"
) {
  throw new Error("Unsafe integration-test database configuration");
}

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.REDIS_URL = "redis://127.0.0.1:6379";
process.env.WEB_ORIGIN = "http://localhost:3000";
process.env.NODE_ENV = "test";

export { TEST_DATABASE_URL };
