import mongoose from "mongoose";
import type { AppConfig } from "../config/env.js";
import { AppLogger } from "../lib/logger.js";

export { UserModel } from "./models/user.js";
export { DeviceModel } from "./models/device.js";
export { AuditLogModel } from "./models/audit-log.js";
export { TransactionModel } from "./models/transaction.js";
export { CategoryModel } from "./models/category.js";
export { PaymentMethodModel } from "./models/payment-method.js";
export { SettingsModel } from "./models/settings.js";
export { BudgetModel } from "./models/budget.js";
export { SyncRecordModel } from "./models/sync-record.js";

export interface DbHandle {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  syncIndexes(): Promise<void>;
  isConnected(): boolean;
}

const CONNECT_ATTEMPTS = 5;
const BACKOFF_MS = 1000;

export async function connectDatabase(
  config: AppConfig,
  logger: AppLogger,
): Promise<void> {
  mongoose.set("strictQuery", true);

  let attempt = 0;
  while (true) {
    attempt += 1;
    try {
      await mongoose.connect(config.mongodbUri, {
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 10,
        minPoolSize: config.isTest ? 0 : 1,
      });
      logger.info({ db: "connected", uri: maskUri(config.mongodbUri) });
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt >= CONNECT_ATTEMPTS) {
        logger.error({ db: "connect-failed", attempt, err: message });
        throw new Error(`Could not connect to MongoDB: ${message}`);
      }
      logger.warn({
        db: "connect-retry",
        attempt,
        nextRetryMs: BACKOFF_MS * attempt,
      });
      await new Promise((resolve) => setTimeout(resolve, BACKOFF_MS * attempt));
    }
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

export async function syncDbIndexes(logger: AppLogger): Promise<void> {
  try {
    await mongoose.connection.syncIndexes();
  } catch (err) {
    logger.warn({
      db: "sync-indexes-failed",
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

export function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

function maskUri(uri: string): string {
  try {
    const url = new URL(uri);
    if (url.password) url.password = "***";
    return url.toString();
  } catch {
    return uri.replace(/:([^@/]+)@/, ":***@");
  }
}
