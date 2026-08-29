/**
 * Financial-transaction detection and bank/sender identification.
 *
 * Runs before parsing and decides whether an SMS is worth parsing at all.
 * Designed to be conservative: drop OTPs, promotions and alerts that lack a
 * transaction signal so we never turn noise into a financial record.
 */

import type { SmsMessage } from "./types.js";

export interface DetectionResult {
  isFinancial: boolean;
  bankSource: string | null;
  reason: "has-amount" | "keyword" | "bank-known" | "none";
}

/** Curated, versioned list of known bank/UPI sender brands (by substring). */
export const KNOWN_BANKS: Array<{ id: string; patterns: RegExp[] }> = [
  { id: "sbi", patterns: [/\bSBI[A-Z0-9]*\b/i, /State Bank/i] },
  { id: "hdfc", patterns: [/\bHDFC(BK)?\b/i, /HDFC/i] },
  { id: "icici", patterns: [/\bICICI\b/i, /ICICI Bank/i] },
  { id: "axis", patterns: [/Axis\s*Bank/i, /\bAXSB/i] },
  { id: "kotak", patterns: [/\bKOTAK\b/i, /Kotak/i] },
  { id: "pnb", patterns: [/\bPNB\b/i, /Punjab Natl/i] },
  { id: "yesbank", patterns: [/YES\s*Bank/i, /\bYESB/i] },
  { id: "idfc", patterns: [/\bIDFC\b/i] },
  { id: "indusind", patterns: [/IndusInd/i, /\bINDB/i] },
  { id: "phonepe", patterns: [/PhonePe/i, /\bPHONPE/i] },
  { id: "gpay", patterns: [/Google Pay/i, /\bGPay\b/i, /\bGPAY/i] },
  { id: "paytm", patterns: [/Paytm/i] },
  { id: "amazonpay", patterns: [/Amazon Pay/i] },
];

/** Signals that strongly imply a transaction even without a symbol amount. */
const KEYWORDS = [
  "debited",
  "credited",
  "spent",
  "paid",
  "received",
  "refund",
  "upi ref",
  "payment",
  "a/c ",
  "transaction",
];

/** Signals that mean "definitely NOT a transaction we should record". */
const IGNORE = ["otp", "one time password", "promotion", "advisory"];

function identifyBank(message: SmsMessage): string | null {
  const haystack = `${message.sender ?? ""} ${message.body}`;
  for (const bank of KNOWN_BANKS) {
    if (bank.patterns.some((re) => re.test(haystack))) return bank.id;
  }
  return null;
}

function hasAmountSignal(text: string): boolean {
  return /(?:₹|rs\.?|inr)\s*\d/i.test(text) || /\b(?:debited|credited)\b/i.test(text);
}

export function detectFinancial(message: SmsMessage): DetectionResult {
  const text = `${message.sender ?? ""} ${message.body}`;
  const lower = text.toLowerCase();

  // Hard ignore for OTP/promo noise regardless of bank.
  if (IGNORE.some((word) => lower.includes(word))) {
    return { isFinancial: false, bankSource: null, reason: "none" };
  }

  const bankSource = identifyBank(message);
  const amount = hasAmountSignal(text);
  const keyword = KEYWORDS.some((k) => lower.includes(k));

  if (amount || keyword) {
    return { isFinancial: true, bankSource, reason: amount ? "has-amount" : keyword ? "keyword" : "none" };
  }
  if (bankSource) {
    return { isFinancial: true, bankSource, reason: "bank-known" };
  }
  return { isFinancial: false, bankSource: null, reason: "none" };
}
