import type { RequestHandler } from "express";
import type { AppConfig } from "../config/env.js";
import { SlidingWindowRateLimiter, assertRateLimit } from "../lib/rate-limiter.js";

export interface RateLimitDeps {
  limiter: SlidingWindowRateLimiter;
  enabled: boolean;
}

/**
 * Per-IP rate limit middleware factory. Throws a 429 (RATE_LIMITED) that the
 * central error handler renders with a Retry-After header.
 */
export function rateLimitByIp(limit: RateLimitDeps): RequestHandler {
  return (req, _res, next) => {
    if (!limit.enabled) {
      next();
      return;
    }
    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
    assertRateLimit(limit.limiter.check(SlidingWindowRateLimiter.ipKey(ip)));
    next();
  };
}

export function createRateLimiters(config: AppConfig): {
  auth: RateLimitDeps;
  register: RateLimitDeps;
  general: RateLimitDeps;
} {
  const windowMs = 60_000;
  return {
    auth: {
      enabled: config.rateLimit.enabled,
      limiter: new SlidingWindowRateLimiter({
        windowMs,
        max: config.rateLimit.authPerMinute,
      }),
    },
    register: {
      enabled: config.rateLimit.enabled,
      limiter: new SlidingWindowRateLimiter({
        windowMs,
        max: config.rateLimit.registerPerMinute,
      }),
    },
    general: {
      enabled: config.rateLimit.enabled,
      limiter: new SlidingWindowRateLimiter({
        windowMs,
        max: config.rateLimit.generalPerMinute,
      }),
    },
  };
}
