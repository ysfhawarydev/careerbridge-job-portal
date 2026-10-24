import "./test-env.js";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { assertTestDatabase } from "./assert-test-db.js";

let app: FastifyInstance;

beforeAll(async () => {
  await assertTestDatabase();

  const { buildApp } = await import("../src/app.js");
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  if (app) await app.close();
});

describe("CareerBridge rate limiting", () => {
  it("returns 429 after exceeding the login limit", async () => {
    const origin = "http://localhost:3000";

    for (let attempt = 1; attempt <= 10; attempt++) {
      const response = await app.inject({
        method: "POST",
        url: "/auth/login",
        headers: {
          origin,
        },
        payload: {
          email: "nonexistent@example.test",
          password: "WrongPassword123!",
        },
      });

      expect(response.statusCode).toBe(401);
    }

    const blocked = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: {
        origin,
      },
      payload: {
        email: "nonexistent@example.test",
        password: "WrongPassword123!",
      },
    });

    expect(blocked.statusCode).toBe(429);
  });
});
