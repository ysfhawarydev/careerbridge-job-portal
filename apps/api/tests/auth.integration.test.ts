import "./test-env.js";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { assertTestDatabase } from "./assert-test-db.js";
import postgres from "postgres";
import { createHash } from "node:crypto";
import { TEST_DATABASE_URL } from "./test-env.js";

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

  it("returns 400 for a malformed job UUID", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/jobs/not-a-valid-uuid",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toHaveProperty("error");
  });

  it("returns 400 for an invalid registration payload", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/register",
      headers: { origin },
      payload: {
        email: "not-an-email",
        password: "short",
        role: "seeker",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toHaveProperty("error");
  });

  it("invalidates the session after logout", async () => {
    const email = `logout-${randomUUID()}@example.test`;

    const registration = await app.inject({
      method: "POST",
      url: "/auth/register",
      headers: { origin },
      payload: {
        email,
        password: "TestPassword123!",
        fullName: "Logout Test",
        role: "seeker",
      },
    });

    expect(registration.statusCode).toBe(200);

    const setCookie = registration.headers["set-cookie"];
    const cookie = (
      Array.isArray(setCookie) ? setCookie[0] : String(setCookie)
    ).split(";")[0];

    const beforeLogout = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie },
    });

    expect(beforeLogout.statusCode).toBe(200);
    expect(beforeLogout.json().user.email).toBe(email);

    const logout = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: {
        origin,
        cookie,
      },
    });

    expect(logout.statusCode).toBe(200);

    const afterLogout = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie },
    });

    expect(afterLogout.statusCode).toBe(200);
    expect(afterLogout.json()).toEqual({ user: null });

    const protectedRoute = await app.inject({
      method: "GET",
      url: "/profile",
      headers: { cookie },
    });

    expect(protectedRoute.statusCode).toBe(401);
  });

  it("sets secure session cookie attributes", async () => {
    const email = `cookie-${randomUUID()}@example.test`;

    const response = await app.inject({
      method: "POST",
      url: "/auth/register",
      headers: { origin },
      payload: {
        email,
        password: "TestPassword123!",
        fullName: "Cookie Test",
        role: "seeker",
      },
    });

    expect(response.statusCode).toBe(200);

    const setCookie = response.headers["set-cookie"];
    const cookie = Array.isArray(setCookie) ? setCookie[0] : String(setCookie);

    expect(cookie).toMatch(/httponly/i);
    expect(cookie).toMatch(/samesite=lax/i);
    expect(cookie).toMatch(/path=\//i);
    expect(cookie).toMatch(/max-age=604800/i);
  });

  it("rejects expired sessions", async () => {
    const email = `expired-${randomUUID()}@example.test`;

    const registration = await app.inject({
      method: "POST",
      url: "/auth/register",
      headers: { origin },
      payload: {
        email,
        password: "TestPassword123!",
        fullName: "Expired Session Test",
        role: "seeker",
      },
    });

    expect(registration.statusCode).toBe(200);

    const setCookie = registration.headers["set-cookie"];
    expect(setCookie).toBeDefined();

    const cookie = (
      Array.isArray(setCookie) ? setCookie[0] : String(setCookie)
    ).split(";")[0];

    const token = cookie.slice("session=".length);
    const tokenHash = createHash("sha256").update(token).digest("hex");

    // Only connect to the isolated integration-test database.
    const db = postgres(TEST_DATABASE_URL, { max: 1 });

    try {
      const database = await db<{ name: string }[]>`
      SELECT current_database() AS name
    `;

      expect(database[0]?.name).toBe("portal_test");

      const updated = await db`
      UPDATE sessions
      SET expires_at = now() - interval '1 minute'
      WHERE token_hash = ${tokenHash}
      RETURNING token_hash
    `;

      expect(updated).toHaveLength(1);
    } finally {
      await db.end();
    }

    const response = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ user: null });

    const protectedResponse = await app.inject({
      method: "GET",
      url: "/profile",
      headers: { cookie },
    });

    expect(protectedResponse.statusCode).toBe(401);
  });
});
