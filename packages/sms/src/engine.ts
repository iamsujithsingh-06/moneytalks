/**
 * SMS ingestion engine — pipeline orchestrator.
 *
 *   detect → parse (provider rule-sets) → normalize → classify
 *
 * Produces a stable `SmsParseResult` with one of four dispositions so callers
 * can route to review, ignore, or manual-entry. All financial SMS go through
 * a review gate before a transaction is created; nothing is auto-committed.
 */

import type {
  SmsDirection,
  SmsMessage,
  SmsParseResult,
  SmsTransactionDraft,
} from "./types.js";
import { detectFinancial } from "./detect.js";
import { applyClassification } from "./classify.js";
import { messageHash } from "./dedup.js";
import { PARSERS } from "./parsers.js";

export type { SmsMessage, SmsParseResult, SmsTransactionDraft } from "./types.js";

const AUTO_CONFIRM_THRESHOLD = 0.75;

/**
 * Normalize raw parser fields into a `SmsTransactionDraft`, classifying the
 * direction into a MoneyTalks type and computing confidence.
 */
function toDraft(
  raw: {
    amountMinor: number;
    currency: string;
    direction: SmsDirection;
    merchant: string | null;
    counterparty: string | null;
    transactionDate: string | null;
    accountRef: string | null;
    upiRef: string | null;
    bankRef: string | null;
    paymentMethodKind: "upi" | "card" | "bank" | "wallet" | null;
    ambiguous?: boolean;
  },
  bankSource: string | null,
  receivedAt: string | null,
  provider: string,
  messageBody: string,
): SmsTransactionDraft {
  // Parsers only return results when direction is debit/credit; "unknown"
  // is defensive and treated as a debit requiring review.
  const direction: "credit" | "debit" = raw.direction === "credit" ? "credit" : "debit";
  const isRefund = direction === "credit"
    ? /refund|reversed|credited back/i.test(messageBody)
    : false;
  const hasRealDate = raw.transactionDate !== null;

  const draft: SmsTransactionDraft = {
    amountMinor: raw.amountMinor,
    currency: raw.currency,
    type: direction === "credit" ? "income" : "expense",
    merchant: raw.merchant,
    counterparty: raw.counterparty,
    transactionDate: raw.transactionDate ?? receivedAt ?? new Date().toISOString(),
    accountRef: raw.accountRef,
    upiRef: raw.upiRef,
    bankRef: raw.bankRef,
    paymentMethodKind: raw.paymentMethodKind,
    bankSource,
    messageHash: messageHash(messageBody),
    confidence: 0,
    provider,
  };

  const classification = applyClassification(draft, direction, hasRealDate);
  if (isRefund) {
    draft.type = "refund";
    draft.confidence = Math.min(1, classification.confidence + 0.05);
  }

  return draft;
}

/** Full pipeline for a single SMS message. */
export function parseSms(message: SmsMessage): SmsParseResult {
  const detection = detectFinancial(message);
  if (!detection.isFinancial) {
    return {
      disposition: "non-transaction",
      bankSource: detection.bankSource,
      reason: "Message shows no financial-transaction signal.",
    };
  }

  for (const parser of PARSERS) {
    if (!parser.matches(message)) continue;
    const raw = parser.parse(message);
    if (!raw) continue;
    const draft = toDraft(
      raw,
      detection.bankSource,
      message.receivedAt,
      parser.id,
      message.body,
    );
    if (draft.confidence >= AUTO_CONFIRM_THRESHOLD) {
      return {
        disposition: "transaction",
        bankSource: detection.bankSource,
        reason: `Parsed via ${parser.id} rule-set; high confidence (${Math.round(draft.confidence * 100)}%). Review before save.`,
        draft,
      };
    }
    if (raw.ambiguous || draft.confidence < AUTO_CONFIRM_THRESHOLD) {
      return {
        disposition: "ambiguous",
        bankSource: detection.bankSource,
        reason: raw.ambiguous
          ? `Parsed via ${parser.id} but multiple accounts were ambiguous; review required.`
          : `Parsed via ${parser.id} but low confidence (${Math.round(draft.confidence * 100)}%); review strongly required.`,
        draft,
      };
    }
  }

  return {
    disposition: "unsupported",
    bankSource: detection.bankSource,
    reason: "Financial-looking message, but no supported format could be parsed confidently.",
  };
}
