/**
 * Smart receipt parsing (8.5): OCR text -> normalized ReceiptDraft.
 *
 * Priorities:
 *   - The FINAL payable total wins over subtotal/tax/discount/item prices.
 *   - Never assume the first/largest amount is the total.
 *   - Merchant comes from the receipt header.
 *   - Per-field confidence + review flags; missing/ambiguous critical fields
 *     are marked `needsReview`, never silently guessed.
 */

import type {
  PaymentMethod,
  ReceiptDraft,
  ReceiptLineItem,
  ReceiptParseResult,
  ReceiptTransactionType,
} from "./types.js";
import {
  collectAmounts,
  cleanMerchant,
  extractReceiptReference,
  parseMoneyToken,
  parseReceiptDate,
  pickTotal,
  type AmountMatch,
} from "./normalize.js";
import { decideNeedsReview, field, overallConfidence } from "./confidence.js";

const HEADER_NOISE =
  /(?:gstin|gst no|tin|phone|tel|web|www|email|@|invoice|cashier|bill no|powered by|order|table|server|addr|address|street|road|receipt\s*#|thank)/i;

const PAYMENT_HINTS: Array<[RegExp, PaymentMethod]> = [
  [/upi\b|phonepe|gpay|google pay|bhim/i, "upi"],
  [/cash\b|paid\s+cash|by\s+cash/i, "cash"],
  [/card\b|visa|mastercard|rupay|amex/gi, "card"],
  [/net\s+banking|bank\s+transfer|n\s*t\s*b|immediate\s+pay|imps|neft|rtgs/i, "bank"],
];

const TYPE_HINTS: Array<[RegExp, ReceiptTransactionType]> = [
  [/refund|credit\s+memo|cash\s+memo|returned|reversed/i, "refund"],
  [/credit\s+note|money\s+received|amount\s+received/i, "income"],
];

interface Labels {
  subtotal: { amountMinor: number; conf: number } | null;
  tax: { amountMinor: number; conf: number } | null;
  discount: { amountMinor: number; conf: number } | null;
}

/** Extract a labelled (subtotal / tax / discount) value from a matching line. */
function labelledValue(text: string, labelRe: RegExp): { amountMinor: number; conf: number } | null {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!labelRe.test(line)) continue;
    const m = /([\d.,]+)$/.exec(line.trim());
    if (!m) continue;
    const parsed = parseMoneyToken(m[1]!);
    if (!parsed) return null;
    // A match with an explicit label is fairly confident (~0.8).
    return { amountMinor: parsed.amountMinor, conf: 0.8 };
  }
  return null;
}

function merchantConfidence(value: string | null): number {
  if (!value) return 0;
  const words = value.trim().split(/\s+/);
  if (words.length === 0) return 0;
  if (words.length >= 2) return 0.9;
  return 0.75; // single word — could be a mis-OCR'd fragment
}

function dateConfidence(date: string | null): number {
  return date ? 0.9 : 0;
}

function totalConfidence(marked: boolean, ambiguous: boolean): number {
  if (ambiguous) return 0.3;
  return marked ? 0.92 : 0.72;
}

function parseAmountContext(amounts: AmountMatch[]) {
  const distinct = new Set(amounts.map((a) => a.amountMinor));
  return {
    multiAmount: amounts.length > 1 && distinct.size > 1,
  };
}

/**
 * Main entry: convert raw OCR text into a draft. Never throws. Always produces
 * a stable `ReceiptParseResult` with an outcome the caller can route safely.
 */
export function parseReceiptText(text: string): ReceiptParseResult {
  const normalized = text.replace(/\r/g, "").trim();
  if (normalized.length === 0) {
    return { outcome: "empty", draft: null, reason: "No OCR text was produced." };
  }

  const amounts = collectAmounts(normalized);
  if (amounts.length === 0) {
    return {
      outcome: "no-amount",
      draft: null,
      reason: "No currency amount could be extracted — review required.",
    };
  }

  const total = pickTotal(amounts);
  const totalAmbiguous = total === null;
  const totalMarked = total !== null && /(?:^|\b)(?:total|payable|amount due|net amount)\b/i.test(total.line);
  const hasCurrency = /₹|rs\.?|inr|rupees?|\$|usd|€|eur|£|gbp|¥/i.test(normalized);

  // Merchant: first plausible header line.
  const merchant = extractMerchant(normalized);

  const date = parseReceiptDate(normalized);
  const reference = extractReceiptReference(normalized);
  const paymentMethod = inferPaymentMethod(normalized);

  const type = inferType(normalized);
  const labels = extractLabels(normalized);

  const { multiAmount } = parseAmountContext(amounts);
  const criticalDateConf = dateConfidence(date);
  const criticalMerchantConf = merchantConfidence(merchant);
  const criticalCurrencyConf = hasCurrency ? 0.9 : 0.55;

  const totalField = total
    ? field(total.amountMinor, totalConfidence(totalMarked, totalAmbiguous), {
        forceReview: totalAmbiguous,
      })
    : field(0, 0, { forceReview: true });

  const dateField = field(date, criticalDateConf, {
    forceReview: !date,
  });
  const merchantField = field(merchant, criticalMerchantConf, {
    forceReview: !merchant,
  });
  const currencyField = field(hasCurrency ? inferCurrency(normalized) : "INR", criticalCurrencyConf);
  const referenceField = field(
    reference,
    reference ? 0.8 : 0.4,
    { forceReview: false },
  );
  const paymentField = field(paymentMethod, paymentMethod ? 0.7 : 0.4);
  const typeField = field<ReceiptTransactionType>(type, type === "expense" ? 0.7 : 0.85);

  const overall = overallConfidence({
    total: totalField.confidence,
    date: dateField.confidence,
    merchant: merchantField.confidence,
    currency: currencyField.confidence,
    reference: referenceField.value ? 0.8 : null,
  });

  const needsReview = decideNeedsReview({
    totalMarked,
    totalAmbiguous,
    totalPresent: totalField.confidence > 0,
    datePresent: dateField.confidence > 0,
    merchantPresent: merchantField.confidence > 0,
  });

  // multiAmount without a labelled total that already couldn't pick → flag.
  const reviewRequired = needsReview || (multiAmount && totalAmbiguous);

  const draft: ReceiptDraft = {
    merchant: merchantField,
    amountMinor: totalField,
    currency: currencyField,
    transactionDate: dateField,
    type: typeField,
    paymentMethod: paymentField,
    reference: referenceField,
    subtotalMinor: labels.subtotal
      ? field(labels.subtotal.amountMinor, labels.subtotal.conf)
      : field(null, 0.4),
    taxMinor: labels.tax
      ? field(labels.tax.amountMinor, labels.tax.conf)
      : field(null, 0.4),
    discountMinor: labels.discount
      ? field(labels.discount.amountMinor, labels.discount.conf)
      : field(null, 0.4),
    lineItems: extractLineItems(normalized),
    overallConfidence: overall,
    needsReview: reviewRequired,
  };

  if (totalAmbiguous) {
    return {
      outcome: "ambiguous",
      draft,
      reason:
        "Multiple plausible totals with no clear TOTAL label — flagged for review, not auto-created.",
    };
  }
  if (total === null) {
    return {
      outcome: "no-amount",
      draft,
      reason: "No payable total was found.",
    };
  }
  return {
    outcome: "parsed",
    draft,
    reason: reviewRequired
      ? "Extraction succeeded but some fields need review."
      : "Extracted a candidate receipt for review.",
  };
}

export function extractLineItems(text: string): ReceiptLineItem[] {
  const items: ReceiptLineItem[] = [];
  const lines = text.split(/\r?\n/);
  // Heuristic: a line with 2+ words and exactly one trailing amount is an item.
  for (const line of lines) {
    if (items.length >= 20) break;
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = /^(.+?)\s+([\d.,]+)$/.exec(trimmed);
    if (!m) continue;
    const desc = m[1]!.trim();
    if (desc.length < 3) continue;
    if (HEADER_NOISE.test(desc)) continue;
    const amount = parseMoneyToken(m[2]!);
    if (!amount) continue;
    items.push({ description: desc, amountMinor: amount.amountMinor });
  }
  return items;
}

function extractMerchant(text: string): string | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.length < 3) continue;
    if (/\d/.test(line)) continue; // address/barcode lines have digits
    if (HEADER_NOISE.test(line)) continue;
    const cleaned = cleanMerchant(line);
    if (!cleaned) continue;
    if (cleaned.length >= 2 && cleaned.length <= 60) return cleaned;
  }
  return null;
}

function inferPaymentMethod(text: string): PaymentMethod {
  for (const [re, method] of PAYMENT_HINTS) {
    if (re.test(text)) return method;
  }
  return null;
}

function inferType(text: string): ReceiptTransactionType {
  for (const [re, type] of TYPE_HINTS) {
    if (re.test(text)) return type;
  }
  return "expense";
}

function inferCurrency(text: string): string {
  if (/₹|rs\.?|inr|rupees?/i.test(text)) return "INR";
  if (/\$|usd/i.test(text)) return "USD";
  if (/€|eur/i.test(text)) return "EUR";
  if (/£|gbp/i.test(text)) return "GBP";
  return "INR";
}

function extractLabels(text: string): Labels {
  return {
    subtotal: labelledValue(text, /(?:^|\b)sub\s*-?\s*total\b/i),
    tax: labelledValue(text, /(?:^|\b)(?:vat|gst|tax|sgst|cgst|igst)\b/i),
    discount: labelledValue(text, /(?:^|\b)(?:discount|less|savings?)\b/i),
  };
}
