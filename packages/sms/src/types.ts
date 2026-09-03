/**
 * Shared public types for the SMS ingestion engine.
 */

/** An SMS message captured on-device (raw text stays local). */
export interface SmsMessage {
  /** Sender address / alphanumeric sender ID, if known. */
  sender: string | null;
  body: string;
  /** ISO timestamp the message was received, if known. */
  receivedAt: string | null;
}

/** Whether the message is a transaction, and which broad classification. */
export type SmsDisposition =
  | "transaction"
  | "non-transaction"
  | "unsupported"
  | "ambiguous";

/** Relationship of the detected transaction to money. */
export type SmsDirection = "debit" | "credit" | "unknown";

/** Canonical MoneyTalks transaction type a draft maps onto. */
export type DraftTransactionType = "expense" | "income" | "refund";

export type SmsPaymentMethodKind = "upi" | "card" | "bank" | "wallet" | null;

/** A normalized transaction candidate derived from a single SMS. */
export interface SmsTransactionDraft {
  amountMinor: number;
  currency: string;
  type: DraftTransactionType;
  /** Cleaned merchant / payee text (already stripped of "payment to" noise). */
  merchant: string | null;
  /** Raw counterparty as shown in the message (e.g. UPI sender). */
  counterparty: string | null;
  /** ISO date or datetime the transaction happened. */
  transactionDate: string;
  /** Masked account/card ref, e.g. "****1234". */
  accountRef: string | null;
  upiRef: string | null;
  bankRef: string | null;
  paymentMethodKind: SmsPaymentMethodKind;
  bankSource: string | null;
  /** Hex SHA-256 of the normalized message body (for exact dedup). */
  messageHash: string;
  /** Overall parsing confidence, 0..1. */
  confidence: number;
  /** The provider rule-set that produced the draft, if any. */
  provider: string | null;
}

export interface SmsParseResult {
  disposition: SmsDisposition;
  /** Identified bank/source when detectable, else null. */
  bankSource: string | null;
  /** Machine + human explanation of the classification. */
  reason: string;
  /** Present only when disposition === "transaction". */
  draft?: SmsTransactionDraft;
}

/** An existing transaction record candidate for duplicate detection. */
export interface DuplicateCandidate {
  transactionDate: string;
  amountMinor: number;
  currency?: string;
  merchant?: string | null;
  accountRef?: string | null;
  messageHash?: string;
  upiRef?: string | null;
  bankRef?: string | null;
  bankSource?: string | null;
}
