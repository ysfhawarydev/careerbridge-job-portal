
import { describe, expect, it } from "vitest";
import { isTrustedOrigin } from "../src/security";

describe("CareerBridge origin security", () => {
  const allowed = "http://localhost:3000";

  it("accepts the trusted frontend origin", () => {
    expect(
      isTrustedOrigin(allowed, undefined, allowed),
    ).toBe(true);
  });

  it("rejects an untrusted origin", () => {
    expect(
      isTrustedOrigin("https://evil.example", undefined, allowed),
    ).toBe(false);
  });

  it("rejects requests without origin or referer", () => {
    expect(
      isTrustedOrigin(undefined, undefined, allowed),
    ).toBe(false);
  });

  it("accepts a trusted referer", () => {
    expect(
      isTrustedOrigin(
        undefined,
        "http://localhost:3000/dashboard",
        allowed,
      ),
    ).toBe(true);
  });

  it("rejects a forged subdomain", () => {
    expect(
      isTrustedOrigin(
        undefined,
        "http://localhost:3000.evil.example/",
        allowed,
      ),
    ).toBe(false);
  });

  it("rejects malformed referer URLs", () => {
    expect(
      isTrustedOrigin(undefined, "not-a-url", allowed),
    ).toBe(false);
  });

  it("does not let referer override an untrusted origin", () => {
    expect(
      isTrustedOrigin(
        "https://evil.example",
        "http://localhost:3000/dashboard",
        allowed,
      ),
    ).toBe(false);
  });
});
