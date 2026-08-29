/**
 * Shared public types for the receipt OCR / smart-capture engine.
 *
 * The engine is environment-agnostic: it runs the same extraction, validation
 * and dedup logic whether the OCR text came from a native on-device provider
 * or a user pasting receipt text. Providers stay behind `OcrProvider` so the
 * UI and pipeline never bind to a specific OCR vendor (ADR-006).
 */

/** Which MoneyTalks transaction type a receipt maps onto. */
export type ReceiptTransactionType = "expense" | "income" | "refund";

/** Outcome of running a provider over an image. */
export type OcrOutcome = "success" | "empty" | "unsupported" | "failure";

/** Stable error codes surfaced to the capture UI. */
export type OcrErrorCode =
  | "empty"
  | "unsupported-image"
  | "unreadable"
  | "ocr-failure"
  | "permission-denied";

/**
 * Result of an OCR provider run. `text` is guarded and kept local only; it is
 * never logged or sent anywhere unencrypted/unsolicited.
 */
export interface OcrExtractionResult {
  outcome: OcrOutcome;
  /** Extracted OCR text. Present only on `success`. */
  text: string | null;
  /** Adjacent context (provider name, confidence) for provenance. */
  provider: string | null;
  /** Why extraction did not succeed (machine + human safe). */
  reason: string | null;
}

/** An image handed to an OCR provider. Bytes are used only for hashing. */
export interface OcrImage {
  /** Data URL for on-device preview only. NOT uploaded. */
  dataUrl?: string;
  /** Raw bytes, used only to compute a content fingerprint. */
  bytes?: Uint8Array;
  mimeType: string;
  name: string;
  size: number;
  width?: number;
  height?: number;
}

/**
 * OCR provider abstraction (ADR-006). Implementations must be environment
 * aware: a provider that cannot run (e.g. no native OCR on a plain browser)
 * reports `available: false` and never fabricates text.
 */
export interface OcrProvider {
  readonly id: string;
  readonly label: string;
  readonly kind: "native" | "manual" | "cloud";
  /** Whether this provider can run in the current runtime. */
  readonly available: boolean;
  /** Present when unavailable — why. */
  readonly reason: string | null;
  extract(image: OcrImage): Promise<OcrExtractionResult>;
  /** Optional permission request for providers that need one (native). */
  requestPermission?(): Promise<boolean>;
}

/** A per-field value with an attached 0..1 confidence. */
export interface ReceiptField<T> {
  value: T;
  confidence: number;
  /** When false-confidence, surface a "needs review" indicator. */
  needsReview: boolean;
}

export type PaymentMethod = "card" | "upi" | "cash" | "bank" | "other" | null;

export interface ReceiptLineItem {
  description: string | null;
  amountMinor?: number;
}

/**
 * A normalized, canonical draft derived from receipt OCR text, ready for the
 * review gate. Every field carries confidence; critical fields (total, date,
 * merchant) can be flagged `needsReview` instead of guessed.
 */
export interface ReceiptDraft {
  merchant: ReceiptField<string | null>;
  /** Final payable total, prioritised over subtotal/tax/discount/items. */
  amountMinor: ReceiptField<number>;
  currency: ReceiptField<string>;
  transactionDate: ReceiptField<string | null>;
  type: ReceiptField<ReceiptTransactionType>;
  paymentMethod: ReceiptField<PaymentMethod>;
  reference: ReceiptField<string | null>;
  subtotalMinor: ReceiptField<number | null>;
  taxMinor: ReceiptField<number | null>;
  discountMinor: ReceiptField<number | null>;
  lineItems: ReceiptLineItem[];
  /** Weighted aggregate of the critical field confidences. */
  overallConfidence: number;
  /** True when any critical field needs review (never auto-commit). */
  needsReview: boolean;
}

/** Result of turning OCR text into a receipt draft. */
export type ReceiptParseOutcome =
  | "parsed"
  | "empty"
  | "no-amount"
  | "ambiguous";

export interface ReceiptParseResult {
  outcome: ReceiptParseOutcome;
  draft: ReceiptDraft | null;
  /** Machine + human explanation (safe to log, no raw receipt contents). */
  reason: string;
}

/** Signals used for duplicate detection (8.8). */
export type OcrDedupeSignal = "image" | "reference" | "content";

export interface OcrDedupeMatch {
  isDuplicate: boolean;
  signals: OcrDedupeSignal[];
  /** The existing record that matched (ledger/draft) when found. */
  matched: Record<string, unknown> | null;
}

/** A candidate existing transaction for duplicate checking. */
export interface OcrDedupeCandidate {
  imageHash?: string;
  reference?: string | null;
  transactionDate: string;
  amountMinor: number;
  currency?: string;
  merchant?: string | null;
}
