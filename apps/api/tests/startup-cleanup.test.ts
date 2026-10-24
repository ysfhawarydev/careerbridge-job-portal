import { describe, expect, it, vi } from "vitest";
import { cleanupStartupResources } from "../src/startup-cleanup.js";

describe("API startup resource cleanup", () => {
  it("closes resources in reverse order", async () => {
    const order: string[] = [];

    await cleanupStartupResources([
      () => {
        order.push("database");
      },
      () => {
        order.push("redis");
      },
      () => {
        order.push("rate-limit-redis");
      },
    ]);
    expect(order).toEqual(["rate-limit-redis", "redis", "database"]);
  });

  it("continues cleanup when a resource fails", async () => {
    const databaseCleanup = vi.fn();
    const redisCleanup = vi.fn(() => {
      throw new Error("Redis cleanup failed");
    });

    await expect(
      cleanupStartupResources([databaseCleanup, redisCleanup]),
    ).rejects.toThrow(AggregateError);

    expect(redisCleanup).toHaveBeenCalledOnce();
    expect(databaseCleanup).toHaveBeenCalledOnce();
  });

  it("supports asynchronous cleanup", async () => {
    const cleanup = vi.fn(async () => undefined);

    await cleanupStartupResources([cleanup]);

    expect(cleanup).toHaveBeenCalledOnce();
  });
});
