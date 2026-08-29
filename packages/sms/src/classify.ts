/**
 * Classification: direction + confidence → canonical MoneyTalks type
 * (expense / income / refund) with an overall confidence score.
 */

import type { DraftTransactionType, SmsDirection, SmsTransactionDraft } from "./types.js";

export interface Classification {
  type: DraftTransactionType;
  confidence: number;
  warnings: string[];
}

/**
 * Map a raw direction + a fully-normalized set of fields to a MoneyTalks
 * transaction type and a confidence score. Confidence is driven by how many
 * critical fields were confidently extracted (amount, date, merchant).
 */
export function classifyDraft(
  direction: SmsDirection,
  isRefund: boolean,
  hasMerchant: boolean,
  hasDate: boolean,
  hasAccountRef: boolean,
): Classification {
  const warnings: string[] = [];

  let type: DraftTransactionType;
  if (isRefund) {
    type = "refund";
  } else {
    type = direction === "credit" ? "income" : "expense";
  }

  let confidence = 0.55;
  if (hasDate) confidence += 0.2;
  if (hasMerchant || hasAccountRef) confidence += 0.1;
  if (hasMerchant && hasDate) confidence += 0.15;

  if (!hasMerchant) warnings.push("No merchant/counterparty extracted; review required.");
  if (!hasDate) warnings.push("No transaction date extracted; will use receipt time.");
  confidence = Math.min(1, confidence);

  // Amount alone is never enough for auto-confirm.
  if (confidence < 0.75) warnings.push("Low confidence; review required.");

  return { type, confidence, warnings };
}

/** Compute confidence and warnings for a draft, mutating its confidence. */
export function applyClassification(
  draft: SmsTransactionDraft,
  direction: SmsDirection,
  hasRealDate: boolean,
): Classification {
  const isRefund = draft.type === "refund";
  const classification = classifyDraft(
    direction,
    isRefund,
    Boolean(draft.merchant || draft.counterparty),
    hasRealDate,
    Boolean(draft.accountRef),
  );
  draft.confidence = classification.confidence;
  draft.type = classification.type;
  return classification;
}
