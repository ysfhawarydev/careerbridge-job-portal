import type { FastifyServerOptions } from "fastify";

export const loggerOptions = {
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers.proxy-authorization",
      "res.headers.set-cookie",
    ],
    censor: "[REDACTED]",
  },
} satisfies NonNullable<FastifyServerOptions["logger"]>;
