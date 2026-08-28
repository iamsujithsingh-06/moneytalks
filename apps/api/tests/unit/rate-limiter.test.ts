import { describe, expect, it } from "vitest";
import { SlidingWindowRateLimiter } from "../../src/lib/rate-limiter.js";

describe("SlidingWindowRateLimiter", () => {
  it("allows requests under the limit", () => {
    const limiter = new SlidingWindowRateLimiter({ windowMs: 60_000, max: 3 });
    expect(limiter.check("k").allowed).toBe(true);
    expect(limiter.check("k").allowed).toBe(true);
    expect(limiter.check("k").allowed).toBe(true);
  });

  it("denies once the limit is reached and returns retryAfterSeconds", () => {
    const limiter = new SlidingWindowRateLimiter({ windowMs: 60_000, max: 2 });
    limiter.check("k");
    limiter.check("k");
    const result = limiter.check("k");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tracks keys independently", () => {
    const limiter = new SlidingWindowRateLimiter({ windowMs: 60_000, max: 1 });
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("b").allowed).toBe(true);
  });

  it("resets state with resetAll", () => {
    const limiter = new SlidingWindowRateLimiter({ windowMs: 60_000, max: 1 });
    limiter.check("k");
    expect(limiter.check("k").allowed).toBe(false);
    limiter.resetAll();
    expect(limiter.check("k").allowed).toBe(true);
  });

  it("normalizes account and ip keys", () => {
    expect(SlidingWindowRateLimiter.accountKey("A@B.com")).toBe(
      "account:a@b.com",
    );
    expect(SlidingWindowRateLimiter.ipKey("127.0.0.1")).toBe("ip:127.0.0.1");
  });
});
