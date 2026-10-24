import { z } from "zod";

const configSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    DATABASE_URL: z
      .string()
      .min(1, "DATABASE_URL must not be empty")
      .default("postgres://portal:portal@localhost:5432/portal")
      .refine(
        (value) =>
          ["postgres:", "postgresql:"].includes(
            (() => {
              try {
                return new URL(value).protocol;
              } catch {
                return "";
              }
            })(),
          ),
        "DATABASE_URL must be a valid PostgreSQL URL",
      ),

    REDIS_URL: z
      .string()
      .min(1, "REDIS_URL must not be empty")
      .default("redis://localhost:6379")
      .refine(
        (value) => {
          try {
            return ["redis:", "rediss:"].includes(new URL(value).protocol);
          } catch {
            return false;
          }
        },
        "REDIS_URL must be a valid Redis URL",
      ),

    WEB_ORIGIN: z
      .string()
      .url("WEB_ORIGIN must be a valid URL")
      .default("http://localhost:3000")
      .refine(
        (value) => {
          const url = new URL(value);
          return (
            (url.protocol === "http:" || url.protocol === "https:") &&
            url.origin === value.replace(/\/$/, "")
          );
        },
        "WEB_ORIGIN must be an HTTP(S) origin without a path",
      ),

    API_PORT: z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .default(4000),

    RATE_LIMIT_NAMESPACE: z
      .string()
      .min(1, "RATE_LIMIT_NAMESPACE must not be empty")
      .default("careerbridge:rate-limit:"),

    READINESS_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1)
      .max(30000)
      .default(1000),
  })
  .superRefine((config, ctx) => {
    if (config.NODE_ENV !== "production") {
      return;
    }

    let database: URL;
    let redis: URL;
    let frontend: URL;

    try {
      database = new URL(config.DATABASE_URL);
    } catch {
      return;
    }

    try {
      redis = new URL(config.REDIS_URL);
    } catch {
      return;
    }

    try {
      frontend = new URL(config.WEB_ORIGIN);
    } catch {
      return;
    }

    if (
      ["portal:portal", "postgres:postgres"].includes(
        `${database.username}:${database.password}`,
      )
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "Default database credentials are not allowed in production",
      });
    }

    if (redis.protocol === "redis:" && redis.hostname !== "localhost" &&
        redis.hostname !== "127.0.0.1" && redis.hostname !== "::1" &&
        !redis.password) {
      ctx.addIssue({
        code: "custom",
        path: ["REDIS_URL"],
        message: "Production Redis must use authentication or a protected local connection",
      });
    }

    if (frontend.protocol !== "https:") {
      ctx.addIssue({
        code: "custom",
        path: ["WEB_ORIGIN"],
        message: "Production WEB_ORIGIN must use HTTPS",
      });
    }
  });

export type ApiConfig = z.infer<typeof configSchema>;

export function parseConfig(
  env: Record<string, string | undefined> = process.env,
): ApiConfig {
  const result = configSchema.safeParse(env);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`)
      .join("\n");

    throw new Error(`Invalid API configuration:\n${details}`);
  }

  return result.data;
}
