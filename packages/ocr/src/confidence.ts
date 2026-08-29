/**
 * Confidence + validation (8.6).
 *
 * Every extracted field gets a 0..1 confidence. Critical money fields (total,
 * date, merchant) drive the overall confidence and the "needs review" gate.
 * When uncertain we mark the field for review rather than guessing a number.
 */

import type {
  OcrDedupeMatch,
  ReceiptDraft,
  ReceiptField,
} from "./types.js";

/** Below this, a field is surfaced as "needs review", never auto-committed. */
export const FIELD_REVIEW_THRESHOLD = 0.6;
/** Overall at/above this AND no flagged fields → safe to present as parsed. */
export const OVERALL_HIGH_THRESHOLD = 0.85;

export type ReceiptSignals = {
  totalMarked: boolean;      // a clear TOTAL label matched
  totalAmbiguous: boolean;   // multiple plausible totals, none marked
  totalPresent: boolean;
  datePresent: boolean;
  merchantPresent: boolean;
};

/** Build a field, flagging low confidence. */
export function field<T>(
  value: T,
  confidence: number,
  opts: { forceReview?: boolean } = {},
): ReceiptField<T> {
  const needsReview =
    Boolean(opts.forceReview) || confidence < FIELD_REVIEW_THRESHOLD;
  return { value, confidence, needsReview };
}

/** Compute overall confidence (weighted toward the total, then date, merchant). */
export function overallConfidence(input: {
  total: number;
  date: number;
  merchant: number;
  currency: number;
  reference: number | null;
}): number {
  const wTotal = input.total * 0.4;
  const wDate = input.date * 0.2;
  const wMerchant = input.merchant * 0.2;
  const wCurrency = input.currency * 0.1;
  const wRef = (input.reference ?? 0.5) * 0.1;
  return round2(wTotal + wDate + wMerchant + wCurrency + wRef);
}

/** Decide the review flags from extraction signals (8.6 rules). */
export function decideNeedsReview(signals: ReceiptSignals): boolean {
  if (!signals.totalPresent) return true; // cannot commit without a total
  if (signals.totalAmbiguous) return true; // never guess among totals
  if (!signals.datePresent) return true; // missing date — must fill/confirm
  if (!signals.merchantPresent) return true; // unclear merchant — confirm
  return false;
}

/** True if a draft is safe to offer for confirmation without mandatory edits. */
export function isAutoConfirmable(draft: ReceiptDraft): boolean {
  if (draft.needsReview) return false;
  if (draft.amountMinor.needsReview) return false;
  if (draft.transactionDate.needsReview) return false;
  if (draft.merchant.needsReview) return false;
  return draft.overallConfidence >= OVERALL_HIGH_THRESHOLD;
}

/** Map a dedup match to a short machine reason for the store. */
export function dedupReason(match: OcrDedupeMatch): string {
  if (!match.isDuplicate) return "";
  return `Duplicate detected (${match.signals.join(", ")}).`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
