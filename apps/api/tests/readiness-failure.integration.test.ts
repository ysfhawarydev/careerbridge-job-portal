import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

import "./test-env.js";

vi.mock("../src/readiness.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/readiness.js")>();

  return {
    ...actual,
    checkReadiness: vi.fn(),
  };
});

import { buildApp } from "../src/app.js";
import { checkReadiness } from "../src/readiness.js";

const mockedCheckReadiness = vi.mocked(checkReadiness);

describe("CareerBridge readiness HTTP failures", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    vi.resetAllMocks();

    if (app) {
      await app.close();
    }
  });

  it("returns 503 when PostgreSQL is unavailable", async () => {
    mockedCheckReadiness.mockResolvedValueOnce({
      ok: false,
      checks: {
        database: false,
        redis: true,
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/ready",
    });

    expect(response.statusCode).toBe(503);

    expect(response.json()).toEqual({
      ok: false,
      checks: {
        database: false,
        redis: true,
      },
    });

    expect(response.headers["x-request-id"]).toBeDefined();
  });

  it("returns 503 when Redis is unavailable", async () => {
    mockedCheckReadiness.mockResolvedValueOnce({
      ok: false,
      checks: {
        database: true,
        redis: false,
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/ready",
    });

    expect(response.statusCode).toBe(503);

    expect(response.json()).toEqual({
      ok: false,
      checks: {
        database: true,
        redis: false,
      },
    });
  });
});
