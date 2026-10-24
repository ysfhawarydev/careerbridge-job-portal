import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.js";

const validEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://portal:portal@localhost:5432/portal",
  REDIS_URL: "redis://localhost:6379",
  WEB_ORIGIN: "http://localhost:3000",
  API_PORT: "4000",
  RATE_LIMIT_NAMESPACE: "careerbridge:test:",
  READINESS_TIMEOUT_MS: "1000",
};

describe("API configuration", () => {
  it("provides safe development defaults", () => {
    const config = parseConfig({});

    expect(config.NODE_ENV).toBe("development");
    expect(config.API_PORT).toBe(4000);
    expect(config.READINESS_TIMEOUT_MS).toBe(1000);
  });

  it("accepts valid configuration", () => {
    const config = parseConfig(validEnv);

    expect(config.NODE_ENV).toBe("test");
    expect(config.API_PORT).toBe(4000);
    expect(config.WEB_ORIGIN).toBe("http://localhost:3000");
  });

  it("rejects malformed database URLs", () => {
    expect(() =>
      parseConfig({
        ...validEnv,
        DATABASE_URL: "not-a-database-url",
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it("rejects malformed Redis URLs", () => {
    expect(() =>
      parseConfig({
        ...validEnv,
        REDIS_URL: "http://localhost:6379",
      }),
    ).toThrow(/REDIS_URL/);
  });

  it("rejects invalid API ports", () => {
    for (const port of ["0", "65536", "abc", "4000.5"]) {
      expect(() =>
        parseConfig({ ...validEnv, API_PORT: port }),
      ).toThrow(/API_PORT/);
    }
  });

  it("rejects invalid readiness timeouts", () => {
    expect(() =>
      parseConfig({
        ...validEnv,
        READINESS_TIMEOUT_MS: "0",
      }),
    ).toThrow(/READINESS_TIMEOUT_MS/);
  });

  it("rejects a frontend URL containing a path", () => {
    expect(() =>
      parseConfig({
        ...validEnv,
        WEB_ORIGIN: "http://localhost:3000/dashboard",
      }),
    ).toThrow(/WEB_ORIGIN/);
  });

  it("rejects default database credentials in production", () => {
    expect(() =>
      parseConfig({
        ...validEnv,
        NODE_ENV: "production",
        DATABASE_URL: "postgres://portal:portal@db.example.com:5432/portal",
        REDIS_URL: "rediss://redis.example.com:6379",
        WEB_ORIGIN: "https://jobs.example.com",
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it("rejects non-HTTPS frontend origins in production", () => {
    expect(() =>
      parseConfig({
        ...validEnv,
        NODE_ENV: "production",
        DATABASE_URL: "postgres://app:strong-password@db.example.com:5432/portal",
        REDIS_URL: "rediss://redis.example.com:6379",
        WEB_ORIGIN: "http://jobs.example.com",
      }),
    ).toThrow(/WEB_ORIGIN/);
  });

  it("does not expose connection credentials in error messages", () => {
    const secret = "my-super-secret-password";

    try {
      parseConfig({
        ...validEnv,
        DATABASE_URL: `postgres://app:${secret}@db.example.com:5432/portal`,
        API_PORT: "invalid",
      });
    } catch (error) {
      expect(String(error)).not.toContain(secret);
      expect(String(error)).toContain("API_PORT");
    }
  });
});
