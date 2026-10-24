import { describe, expect, it, vi } from "vitest";
import { checkReadiness } from "../src/readiness.js";

describe("CareerBridge dependency readiness", () => {
  it("reports healthy dependencies", async () => {
    const result = await checkReadiness(
      async () => true,
      async () => "PONG",
    );

    expect(result).toEqual({
      ok: true,
      checks: {
        database: true,
        redis: true,
      },
    });
  });

  it("reports database failure", async () => {
    const result = await checkReadiness(
      async () => {
        throw new Error("database unavailable");
      },
      async () => "PONG",
    );

    expect(result).toEqual({
      ok: false,
      checks: {
        database: false,
        redis: true,
      },
    });
  });

  it("reports Redis failure", async () => {
    const result = await checkReadiness(
      async () => true,
      async () => {
        throw new Error("redis unavailable");
      },
    );

    expect(result).toEqual({
      ok: false,
      checks: {
        database: true,
        redis: false,
      },
    });
  });

  it("reports failure when both dependencies are unavailable", async () => {
    const result = await checkReadiness(
      async () => {
        throw new Error("database unavailable");
      },
      async () => {
        throw new Error("redis unavailable");
      },
    );

    expect(result).toEqual({
      ok: false,
      checks: {
        database: false,
        redis: false,
      },
    });
  });

  it("checks both dependencies concurrently", async () => {
    const database = vi.fn(async () => true);
    const redis = vi.fn(async () => "PONG");

    await checkReadiness(database, redis);

    expect(database).toHaveBeenCalledOnce();
    expect(redis).toHaveBeenCalledOnce();
  });

  it("marks a database check unhealthy when it times out", async () => {
    const result = await checkReadiness(
      () => new Promise(() => {}),
      async () => "PONG",
      { timeoutMs: 20 },
    );

    expect(result).toEqual({
      ok: false,
      checks: {
        database: false,
        redis: true,
      },
    });
  });

  it("marks Redis unhealthy when it times out", async () => {
    const result = await checkReadiness(
      async () => true,
      () => new Promise(() => {}),
      { timeoutMs: 20 },
    );

    expect(result).toEqual({
      ok: false,
      checks: {
        database: true,
        redis: false,
      },
    });
  });

  it("marks both dependencies unhealthy when both time out", async () => {
    const result = await checkReadiness(
      () => new Promise(() => {}),
      () => new Promise(() => {}),
      { timeoutMs: 20 },
    );

    expect(result).toEqual({
      ok: false,
      checks: {
        database: false,
        redis: false,
      },
    });
  });

  it("rejects invalid timeout values", async () => {
    await expect(
      checkReadiness(
        async () => true,
        async () => true,
        {
          timeoutMs: 0,
        },
      ),
    ).rejects.toThrow("timeoutMs must be a positive finite number");
  });
});
