import "./test-env.js";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { assertTestDatabase } from "./assert-test-db.js";

let app: FastifyInstance;

const origin = "http://localhost:3000";

beforeAll(async () => {
  await assertTestDatabase();

  const { buildApp } = await import("../src/app.js");

  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  if (app) await app.close();
});

describe("CareerBridge authentication integration", () => {
  it("responds to health checks", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it("rejects unauthenticated access to seeker profiles", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/profile",
    });

    expect(response.statusCode).toBe(401);
  });

  it("rejects unauthenticated access to employer jobs", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/employer/jobs",
    });

    expect(response.statusCode).toBe(401);
  });

  it("rejects mutations without a trusted origin", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/logout",
    });

    expect(response.statusCode).toBe(403);
  });

  it("allows logout requests from the trusted origin", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { origin },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it("registers a seeker and creates a session", async () => {
    const email = `seeker-${randomUUID()}@example.test`;

    const response = await app.inject({
      method: "POST",
      url: "/auth/register",
      headers: { origin },
      payload: {
        email,
        password: "TestPassword123!",
        fullName: "Test Seeker",
        role: "seeker",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.email).toBe(email);
    expect(response.headers["set-cookie"]).toBeDefined();
  });

  it("rejects invalid login credentials", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { origin },
      payload: {
        email: "nonexistent@example.test",
        password: "WrongPassword123!",
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it("prevents seekers from creating companies", async () => {
    const email = `seeker-${randomUUID()}@example.test`;

    const registration = await app.inject({
      method: "POST",
      url: "/auth/register",
      headers: { origin },
      payload: {
        email,
        password: "TestPassword123!",
        fullName: "Test Seeker",
        role: "seeker",
      },
    });

    expect(registration.statusCode).toBe(200);

    const cookie = registration.headers["set-cookie"];

    const response = await app.inject({
      method: "POST",
      url: "/companies",
      headers: {
        origin,
        cookie: Array.isArray(cookie) ? cookie[0] : String(cookie),
      },
      payload: {
        name: "Unauthorized Company",
        description: "Should not be created",
      },
    });

    expect(response.statusCode).toBe(403);
  });
});
