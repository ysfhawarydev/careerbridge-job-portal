import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import "./test-env.js";

describe("CareerBridge API observability", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it("returns a request ID in successful responses", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-request-id"]).toBeDefined();
    expect(typeof response.headers["x-request-id"]).toBe("string");
  });

  it("includes the request ID in validation errors", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/jobs/not-a-valid-uuid",
    });

    expect(response.statusCode).toBe(400);

    const body = response.json();

    expect(body.requestId).toBe(response.headers["x-request-id"]);
    expect(body.error).toBeDefined();
  });

  it("does not trust a client-provided request ID", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: {
        "request-id": "attacker-controlled-id",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-request-id"]).not.toBe(
      "attacker-controlled-id",
    );
  });
});
