export type ReadinessChecks = {
  database: boolean;
  redis: boolean;
};

export async function checkReadiness(
  checkDatabase: () => Promise<unknown>,
  checkRedis: () => Promise<unknown>,
): Promise<{ ok: boolean; checks: ReadinessChecks }> {
  const [databaseResult, redisResult] = await Promise.allSettled([
    Promise.resolve().then(checkDatabase),
    Promise.resolve().then(checkRedis),
  ]);

  const checks = {
    database: databaseResult.status === "fulfilled",
    redis: redisResult.status === "fulfilled",
  };

  return {
    ok: checks.database && checks.redis,
    checks,
  };
}
