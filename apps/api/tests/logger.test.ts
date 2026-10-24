import { describe, expect, it } from "vitest";
import pino from "pino";
import { loggerOptions } from "../src/logger.js";

describe("CareerBridge logger redaction", () => {
  it("redacts sensitive request and response headers", () => {
    const chunks: string[] = [];

    const stream = {
      write(chunk: string) {
        chunks.push(chunk);
      },
    };

    const logger = pino(loggerOptions, stream);

    logger.info({
      req: {
        headers: {
          authorization: "Bearer secret-token",
          cookie: "session=secret-cookie",
          "proxy-authorization": "Basic secret-proxy",
        },
      },
      res: {
        headers: {
          "set-cookie": "session=secret-response-cookie",
        },
      },
    });

    const output = chunks.join("");

    expect(output).toContain("[REDACTED]");
    expect(output).not.toContain("secret-token");
    expect(output).not.toContain("secret-cookie");
    expect(output).not.toContain("secret-proxy");
    expect(output).not.toContain("secret-response-cookie");
  });
});
