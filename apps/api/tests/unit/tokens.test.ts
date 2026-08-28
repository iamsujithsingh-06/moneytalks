import { describe, expect, it } from "vitest";
import {
  createRefreshToken,
  hashToken,
  refreshTokenExpiry,
  signAccessToken,
  verifyAccessToken,
} from "../../src/lib/tokens.js";
import { loadConfig } from "../../src/config/env.js";
import { ErrorCodes } from "../../src/lib/errors.js";

function testConfig(overrides: Record<string, string> = {}) {
  return loadConfig({
    NODE_ENV: "test",
    JWT_SECRET: "unit-test-secret-0123456789abcdef-0123456789",
    ...overrides,
  });
}

describe("refresh tokens", () => {
  it("generates a 256-bit opaque token", () => {
    const token = createRefreshToken();
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(token).not.toContain("=");
  });

  it("hashes tokens deterministically with SHA-256", () => {
    const token = "some-token-value";
    expect(hashToken(token)).toHaveLength(64);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(token);
  });

  it("computes sliding expiry from the configured TTL", () => {
    const config = testConfig({ REFRESH_TOKEN_TTL_DAYS: "30" });
    const now = new Date("2026-01-01T00:00:00Z");
    const expiry = refreshTokenExpiry(config, now);
    expect(expiry.getTime()).toBe(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  });
});

describe("access tokens (JWT)", () => {
  it("signs and verifies a round trip", async () => {
    const config = testConfig();
    const token = await signAccessToken(config, {
      userId: "user-1",
      deviceId: "device-1",
      tokenVersion: 3,
    });
    const payload = await verifyAccessToken(config, token);
    expect(payload.sub).toBe("user-1");
    expect(payload.deviceId).toBe("device-1");
    expect(payload.tokenVersion).toBe(3);
    expect(payload.type).toBe("access");
  });

  it("rejects a token signed with a different secret", async () => {
    const configA = testConfig();
    const configB = testConfig({ JWT_SECRET: "a-different-secret-0123456789abcdef-01" });
    const token = await signAccessToken(configA, {
      userId: "user-1",
      deviceId: "device-1",
      tokenVersion: 1,
    });
    await expect(verifyAccessToken(configB, token)).rejects.toMatchObject({
      code: ErrorCodes.Unauthorized,
    });
  });

  it("rejects an expired token", async () => {
    const config = testConfig({ JWT_ACCESS_TTL_SECONDS: "1" });
    const token = await signAccessToken(config, {
      userId: "user-1",
      deviceId: "device-1",
      tokenVersion: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await expect(verifyAccessToken(config, token)).rejects.toMatchObject({
      code: ErrorCodes.TokenExpired,
    });
  });

  it("rejects garbage input", async () => {
    const config = testConfig();
    await expect(verifyAccessToken(config, "not.a.jwt")).rejects.toMatchObject({
      code: ErrorCodes.Unauthorized,
    });
  });
});
