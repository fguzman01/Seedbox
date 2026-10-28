import { describe, expect, it } from "vitest";
import { checkWriteAccess, hasValidCredentials, parseBasicAuth } from "./auth";

const basic = (credentials: string) => `Basic ${Buffer.from(credentials).toString("base64")}`;

describe("parseBasicAuth", () => {
  it("decodes user:password", () => {
    expect(parseBasicAuth(basic("felipe:s3cr3t:with:colons"))).toBe("felipe:s3cr3t:with:colons");
    expect(parseBasicAuth(`basic ${Buffer.from("a:b").toString("base64")}`)).toBe("a:b");
  });

  it("rejects missing, malformed or other schemes", () => {
    for (const header of [null, undefined, "", "Bearer abc", "Basic", basic("no-colon"), "Basic a b"]) {
      expect(parseBasicAuth(header)).toBeNull();
    }
  });
});

describe("hasValidCredentials", () => {
  it("accepts only the exact credentials", () => {
    expect(hasValidCredentials(basic("felipe:pw"), "felipe:pw")).toBe(true);
    expect(hasValidCredentials(basic("felipe:pw2"), "felipe:pw")).toBe(false);
    expect(hasValidCredentials(basic("felipe:p"), "felipe:pw")).toBe(false);
    expect(hasValidCredentials(null, "felipe:pw")).toBe(false);
  });
});

describe("checkWriteAccess", () => {
  it("allows writes in development without credentials", () => {
    expect(checkWriteAccess(null, { NODE_ENV: "development" })).toEqual({ allowed: true });
  });

  it("is read-only in production when no credentials are configured", () => {
    const access = checkWriteAccess(basic("any:thing"), { NODE_ENV: "production" });
    expect(access).toMatchObject({ allowed: false, reason: expect.stringContaining("SEEDBOX_BASIC_AUTH") });
  });

  it("requires matching credentials whenever they are configured", () => {
    const env = { NODE_ENV: "production", SEEDBOX_BASIC_AUTH: "felipe:pw" };
    expect(checkWriteAccess(basic("felipe:pw"), env)).toEqual({ allowed: true });
    expect(checkWriteAccess(basic("felipe:nope"), env).allowed).toBe(false);
    expect(checkWriteAccess(null, { ...env, NODE_ENV: "development" }).allowed).toBe(false);
  });
});
