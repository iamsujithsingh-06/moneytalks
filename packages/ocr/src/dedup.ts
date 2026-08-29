/**
 * Duplicate detection for OCR-derived transactions (8.8).
 *
 * Signals, OR-combined (checked against both the ledger and local drafts so
 * the same receipt can never create a duplicate offline or across devices):
 *   1. image hash      — the exact same image/receipt scanned or imported again
 *   2. reference       — the same invoice/receipt/order reference number
 *   3. content         — (merchant, amount, currency, date) fingerprint within
 *                        a short window, so an SMS/manual capture of the same
 *                        purchase is caught too.
 *
 * Ambiguity goes to review rather than being treated as a hard duplicate, so
 * legitimate identical purchases are not wrongly blocked.
 */

import type { OcrDedupeCandidate, OcrDedupeMatch } from "./types.js";
import { imageHash, sha256Hex } from "./sha.js";

interface Fingerprintable {
  transactionDate: string;
  amountMinor: number;
  currency?: string;
  merchant?: string | null;
}

function dayKey(iso: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  return m && m[1] ? m[1] : null;
}

function timeMs(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

/** Content fingerprint over (day, amount, currency, merchant). */
export function receiptContentFingerprint(d: Fingerprintable): string {
  const day = dayKey(d.transactionDate) ?? "";
  const merchant = (d.merchant ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  const currency = (d.currency ?? "INR").trim().toUpperCase();
  const payload = [day, String(d.amountMinor), currency, merchant].join("|");
  return sha256Hex(payload);
}

function normalizeRef(ref: string): string {
  return ref.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Check a candidate against existing records. Returns true on the first exact
 * signal (image/reference) or a content-fingerprint match within the window
 * (default 48h). Non-destructive and never throws.
 */
export function isReceiptDuplicate(
  draft: {
    transactionDate: string;
    amountMinor: number;
    currency: string;
    merchant?: string | null;
    imageHash?: string;
    reference?: string | null;
  },
  existing: OcrDedupeCandidate[],
  options: { windowHours?: number; requireExact?: boolean } = {},
): OcrDedupeMatch {
  const windowHours = options.windowHours ?? 48;
  const draftTime = timeMs(draft.transactionDate);

  for (const cand of existing) {
    // 1. Same image / identical receipt.
    if (draft.imageHash && cand.imageHash && cand.imageHash === draft.imageHash) {
      return { isDuplicate: true, signals: ["image"], matched: cand as unknown as Record<string, unknown> };
    }
    // 2. Same reference number.
    if (draft.reference && cand.reference) {
      if (normalizeRef(draft.reference) === normalizeRef(cand.reference)) {
        return { isDuplicate: true, signals: ["reference"], matched: cand as unknown as Record<string, unknown> };
      }
    }
    // 3. Content fingerprint within window.
    if (
      !options.requireExact &&
      cand.amountMinor === draft.amountMinor &&
      dayKey(cand.transactionDate) &&
      dayKey(draft.transactionDate)
    ) {
      const diff = Math.abs(timeMs(cand.transactionDate) - draftTime);
      if (Number.isFinite(diff) && diff <= windowHours * 60 * 60 * 1000) {
        if (
          receiptContentFingerprint({
            transactionDate: cand.transactionDate,
            amountMinor: cand.amountMinor,
            currency: cand.currency ?? draft.currency,
            merchant: cand.merchant,
          }) ===
          receiptContentFingerprint({
            transactionDate: draft.transactionDate,
            amountMinor: draft.amountMinor,
            currency: draft.currency,
            merchant: draft.merchant,
          })
        ) {
          return { isDuplicate: true, signals: ["content"], matched: cand as unknown as Record<string, unknown> };
        }
      }
    }
  }

  return { isDuplicate: false, signals: [], matched: null };
}

export { imageHash };
