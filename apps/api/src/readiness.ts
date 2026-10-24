export type ReadinessChecks = {
  database: boolean;
  redis: boolean;
};

export type ReadinessResult = {
  ok: boolean;
  checks: ReadinessChecks;
};

export type ReadinessOptions = {
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 1_000;

async function checkWithTimeout(
  check: () => Promise<unknown>,
  timeoutMs: number,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      Promise.resolve()
        .then(check)
        .then(
          () => true,
          () => false,
        ),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

export async function checkReadiness(
  checkDatabase: () => Promise<unknown>,
  checkRedis: () => Promise<unknown>,
  options: ReadinessOptions = {},
): Promise<ReadinessResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("timeoutMs must be a positive finite number");
  }

  const [database, redis] = await Promise.all([
    checkWithTimeout(checkDatabase, timeoutMs),
    checkWithTimeout(checkRedis, timeoutMs),
  ]);

  const checks: ReadinessChecks = { database, redis };

  return {
    ok: checks.database && checks.redis,
    checks,
  };
}
