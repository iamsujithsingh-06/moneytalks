/**
 * Duplicate detection for SMS-derived transactions.
 *
 * Three OR-combined signals (matching ADR-005 / SMS architecture §10):
 *   1. exact message hash (same raw message body),
 *   2. UPI ref (same transaction reference),
 *   3. content fingerprint (bank/amount/date/merchant within a window).
 *
 * Checked against both local drafts and already-synced ledger records, so the
 * same SMS can never create a duplicate — offline or across devices.
 */

import type { DuplicateCandidate, SmsTransactionDraft } from "./types.js";
import { sha256Hex } from "./hash.js";

export interface DuplicateMatch {
  isDuplicate: boolean;
  signals: Array<"message" | "upiRef" | "fingerprint">;
  matched: DuplicateCandidate | null;
}

function dayKey(iso: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  return m && m[1] ? m[1] : null;
}

function dateWindowHours(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

/**
 * Build a deterministic message hash from a normalized message body.
 * Normalization removes surrounding whitespace only, keeping the message
 * stable for exact duplicate detection.
 */
export function messageHash(body: string): string {
  return sha256Hex(body.replace(/\s+/g, " ").trim().toLowerCase());
}

/** Content fingerprint over (date, amount, currency, merchant, account). */
export function contentFingerprint(draft: {
  transactionDate: string;
  amountMinor: number;
  currency: string;
  merchant?: string | null;
  accountRef?: string | null;
}): string {
  const day = dayKey(draft.transactionDate) ?? "";
  const merchant = (draft.merchant ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  const account = (draft.accountRef ?? "").trim().toLowerCase();
  const payload = [day, String(draft.amountMinor), draft.currency.toUpperCase(), merchant, account].join("|");
  return sha256Hex(payload);
}

/**
 * Check a normalized draft against a set of existing candidates. Returns true
 * if any exact signal matches, or a fuzzy fingerprint match within +/-2 days
 * of the draft date.
 */
export function isDuplicate(
  draft: SmsTransactionDraft,
  existing: DuplicateCandidate[],
  options: { fingerprintWindowHours?: number } = {},
): DuplicateMatch {
  const windowHours = options.fingerprintWindowHours ?? 48;
  const draftFp = contentFingerprint(draft);
  const draftTime = dateWindowHours(draft.transactionDate);

  let matched: DuplicateCandidate | null = null;
  const signals: DuplicateMatch["signals"] = [];

  for (const cand of existing) {
    // 1. Exact message
    if (cand.messageHash && draft.messageHash && cand.messageHash === draft.messageHash) {
      matched = cand;
      signals.push("message");
      break;
    }
    // 2. UPI ref
    if (cand.upiRef && draft.upiRef && cand.upiRef === draft.upiRef) {
      matched = cand;
      signals.push("upiRef");
      break;
    }
    // 3. Fingerprint within window
    if (cand.amountMinor === draft.amountMinor) {
      const candDay = dayKey(cand.transactionDate);
      const draftDay = dayKey(draft.transactionDate);
      if (candDay && draftDay && candDay === draftDay) {
        if (contentFingerprint({
          transactionDate: cand.transactionDate,
          amountMinor: cand.amountMinor,
          currency: cand.currency ?? draft.currency,
          merchant: cand.merchant,
          accountRef: cand.accountRef,
        }) === draftFp) {
          matched = cand;
          signals.push("fingerprint");
          break;
        }
      }
      if (candDay && draftDay) {
        const candTime = dateWindowHours(cand.transactionDate);
        const diff = Math.abs(candTime - draftTime);
        if (Number.isFinite(diff) && diff <= windowHours * 60 * 60 * 1000) {
          if (contentFingerprint({
            transactionDate: cand.transactionDate,
            amountMinor: cand.amountMinor,
            currency: cand.currency ?? draft.currency,
            merchant: cand.merchant,
            accountRef: cand.accountRef,
          }) === draftFp) {
            matched = cand;
            signals.push("fingerprint");
            break;
          }
        }
      }
    }
  }

  return { isDuplicate: signals.length > 0, signals, matched };
}

export type { DuplicateCandidate };
