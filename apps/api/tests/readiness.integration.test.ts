import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import "./test-env.js";

describe("CareerBridge API readiness", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it("keeps the liveness endpoint lightweight", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it("reports healthy PostgreSQL and Redis dependencies", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/ready",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      checks: {
        database: true,
        redis: true,
      },
    });
  });

  it("includes a request ID on readiness responses", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/ready",
    });

    expect(response.headers["x-request-id"]).toBeDefined();
  });
});
