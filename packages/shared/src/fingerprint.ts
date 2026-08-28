import { createHash } from "node:crypto";
import { isPositiveMinorUnitsAmount } from "./money.js";

export const FINGERPRINT_VERSION = "fp:v1:";

export interface TransactionFingerprintInput {
  amountMinor: number;
  currency: string;
  transactionDate: Date | string;
  merchant?: string;
  source?: string;
}

function canonicalDate(value: Date | string): string {
  if (typeof value === "string") {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
    if (!match) {
      throw new RangeError("transactionDate is invalid for fingerprinting");
    }
    const day = match[1];
    if (!day) {
      throw new RangeError("transactionDate is invalid for fingerprinting");
    }
    return day;
  }
  if (Number.isNaN(value.getTime())) {
    throw new RangeError("transactionDate is invalid for fingerprinting");
  }
  return value.toISOString().slice(0, 10);
}

function canonicalText(value: string | undefined): string {
  if (!value) return "";
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Builds a canonical, deterministic, versioned fingerprint for a candidate
 * transaction from the fuzzy key `(date, amountMinor, currency, merchant,
 * source)`. Same content always produces the same fingerprint regardless of
 * casing, whitespace or time-of-day, so it can back a unique `{userId,
 * fingerprint}` index for duplicate prevention (see DATABASE_ARCHITECTURE §6).
 */
export function buildTransactionFingerprint(
  input: TransactionFingerprintInput,
): string {
  if (!isPositiveMinorUnitsAmount(input.amountMinor)) {
    throw new RangeError("amountMinor must be a positive integer in minor units");
  }
  const currency = input.currency.trim().toUpperCase();
  const payload = [
    canonicalDate(input.transactionDate),
    String(input.amountMinor),
    currency,
    canonicalText(input.merchant),
    canonicalText(input.source),
  ].join("|");
  return (
    FINGERPRINT_VERSION +
    createHash("sha256").update(payload).digest("hex")
  );
}
