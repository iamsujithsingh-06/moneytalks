import { AppError, ErrorCodes } from "./errors.js";

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
}

/**
 * In-memory sliding-window rate limiter. Single-process only; a Redis-backed
 * limiter replaces this when infra/ (Redis) lands in a later phase.
 */
export class SlidingWindowRateLimiter {
  private readonly windowMs: number;
  private readonly max: number;
  private readonly timestamps = new Map<string, number[]>();
  private readonly start: number;

  constructor(options: RateLimiterOptions) {
    this.windowMs = options.windowMs;
    this.max = options.max;
    this.start = Date.now();
  }

  check(key: string): RateLimitResult {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    const entries = (this.timestamps.get(key) ?? []).filter((t) => t > cutoff);

    if (entries.length >= this.max) {
      const oldest = entries[0] ?? now;
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((oldest + this.windowMs - now) / 1000),
      );
      return { allowed: false, retryAfterSeconds };
    }

    entries.push(now);
    this.timestamps.set(key, entries);
    return { allowed: true };
  }

  /** Key used to distinguish per-account vs per-IP limits. */
  static accountKey(email: string): string {
    return `account:${email.toLowerCase()}`;
  }

  static ipKey(ip: string): string {
    return `ip:${ip}`;
  }

  resetAll(): void {
    this.timestamps.clear();
  }
}

export function assertRateLimit(
  result: RateLimitResult,
  message = "Too many requests, please try again later",
): void {
  if (!result.allowed) {
    throw new AppError(429, ErrorCodes.RateLimited, message, {
      retryable: true,
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }
}
