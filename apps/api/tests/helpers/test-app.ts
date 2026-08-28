import type { Express } from "express";
import mongoose from "mongoose";
import { loadConfig, type AppConfig } from "../../src/config/env.js";
import { createLogger, type AppLogger } from "../../src/lib/logger.js";
import { connectDatabase, disconnectDatabase, syncDbIndexes } from "../../src/db/index.js";
import { createApp } from "../../src/app.js";
import { SlidingWindowRateLimiter } from "../../src/lib/rate-limiter.js";
import type { CategoryService } from "../../src/modules/categories/service.js";

const TEST_JWT_SECRET =
  "test-only-secret-0123456789abcdef-0123456789abcdef";

export interface TestApp {
  app: Express;
  config: AppConfig;
  logger: AppLogger;
}

export async function createTestApp(
  overrides: Record<string, string> = {},
  options: {
    accountRateLimiter?: SlidingWindowRateLimiter;
    categoriesService?: CategoryService;
  } = {},
): Promise<TestApp> {
  const config = loadConfig({
    NODE_ENV: "test",
    MONGODB_URI:
      process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/moneytalks_test",
    JWT_SECRET: TEST_JWT_SECRET,
    LOG_LEVEL: "silent",
    AUTH_RATE_LIMIT_ENABLED: "false",
    ...overrides,
  } as unknown as Record<string, string | undefined>);
  const logger = createLogger(config);

  if (mongoose.connection.readyState !== 1) {
    await connectDatabase(config, logger);
  }
  await syncDbIndexes(logger);

  const app = createApp({
    config,
    logger,
    accountRateLimiter: options.accountRateLimiter,
    categoriesService: options.categoriesService,
  });
  return { app, config, logger };
}

export async function clearDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
  }
}

export async function closeDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await disconnectDatabase();
  }
}

/**
 * Creates a fresh per-account login rate limiter for a test app, letting a
 * test file reset it between cases without exhausting the sliding window.
 */
export function createAccountRateLimiter(
  maxPerMinute = 10,
): SlidingWindowRateLimiter {
  return new SlidingWindowRateLimiter({ windowMs: 60_000, max: maxPerMinute });
}
