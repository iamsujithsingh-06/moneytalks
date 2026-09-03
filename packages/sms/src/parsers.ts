/**
 * Provider / rule-set parsing architecture.
 *
 * Each parser is a small, versioned rule-set that maps one family of SMS
 * formats to normalized raw fields. New formats are added as new parsers
 * without touching the core engine. Parsers never guess critical financial
 * values — they return `null` when confidence is insufficient and the engine
 * downgrades to "ambiguous"/"unsupported".
 */

import type { SmsDirection, SmsMessage, SmsPaymentMethodKind } from "./types.js";
import {
  cleanMerchant,
  extractMaskedAccountRef,
  extractRef,
  parseAmount,
  parseDateString,
} from "./normalize.js";

/** Raw fields extracted by a parser before final normalization/classification. */
export interface RawFields {
  amountMinor: number;
  currency: string;
  direction: SmsDirection;
  merchant: string | null;
  counterparty: string | null;
  transactionDate: string | null;
  accountRef: string | null;
  upiRef: string | null;
  bankRef: string | null;
  paymentMethodKind: SmsPaymentMethodKind;
  /** True when multiple non-balance amounts were equally plausible. */
  ambiguous?: boolean;
}

export interface SmsParser {
  /** Stable provider/rule-set id, e.g. "sbi" or "generic". */
  readonly id: string;
  /** Whether this parser should be attempted for the message. */
  matches(message: SmsMessage): boolean;
  /** Extract normalized raw fields, or null if confidence is insufficient. */
  parse(message: SmsMessage): RawFields | null;
}

function directionOf(text: string): SmsDirection {
  if (/credited back|refunded|refund|reversed/i.test(text)) return "credit";
  // "X sent you / has sent Rs.Y" means money received; a bare "Sent Rs.Y from
  // A/c..." is an outgoing payment from the user's own account.
  if (/sent you|has sent/i.test(text)) return "credit";
  if (/credited|received|recvd|added to/i.test(text)) return "credit";
  if (
    /debited|withdrawn|paid|spent|used|purchase|charged|payment of|sent\b/i.test(text)
  ) {
    return "debit";
  }
  return "unknown";
}

/**
 * Extract a phrase after a marker such as "paid to", "to", "at", "from"
 * stopping at the first strong boundary (a following date, "ON", "UPI",
 * "REF", "AVL", "AVAILABLE", "BAL", "USING" or a sentence split).
 */
function afterMarker(text: string, marker: RegExp): string | null {
  const m = marker.exec(text);
  if (!m) return null;
  const rest = text.slice(m.index + m[0].length).trim();
  const boundary =
    /\b(on\s+\d{1,2}[-/.]|dated|using|via|upi|ref|avl|available|bal|at\s+[A-Z]{2,}|\.\s+[A-Za-z]{3,})/i.exec(
      rest,
    );
  const value = boundary ? rest.slice(0, boundary.index) : rest;
  const cleaned = value.replace(/[.\s,]+$/g, "").trim();
  if (!cleaned || /^(upi|ref|bank|a\/c|acct)$/i.test(cleaned)) return null;
  return cleaned;
}

/** True if a candidate string looks like an account/card reference, not a merchant. */
function looksLikeAccountRef(value: string): boolean {
  return /(?:a\/c|account|acct|card|x{2,}|\*{2,}|^\*|\d{8,})/i.test(value);
}

/**
 * Trim trailing non-name tokens that a loose name capture may have absorbed
 * (e.g. "Mr Tharun Kumar on 03-09-26" -> "Mr Tharun Kumar"). Also drops a
 * sentence separator or trailing punctuation before the remaining value.
 */
function cleanPartyName(value: string): string | null {
  return cleanMerchant(
    value
      .replace(
        /\s+(?:on|from|via|upi|ref|rrn|at|dated|using)\b.*$/i,
        "",
      )
      .replace(/[.\s,]+$/g, "")
      .trim(),
  );
}

/**
 * Boundary lookahead for an Indian Bank party-name capture ("to <name>" /
 * "by <name>"). Stops before a following date/boundary word or a sentence
 * separator so trailing content is never swallowed.
 */
const PARTY_NAME_BOUNDARY =
  /\s+(?:using|on|via|upi|ref|rrn|at|dated|\d)|[.,'']|$/i;

/** Extract merchant/payee (outflow receiver) from common phrasings. */
function extractMerchant(text: string): string | null {
  const paidTo = /(?:paid|pay)\s+to\s+([A-Za-z0-9 .&]+?)(?=\s+(?:using|on|via|upi|ref|\.|$))/i.exec(text);
  if (paidTo) {
    const v = cleanMerchant(paidTo[1]!);
    if (!looksLikeAccountRef(v)) return v;
  }
  const at = afterMarker(text, /\b(?:at)\s+(?!upi|ref|bank|a\/c|account|acct)/i);
  if (at) {
    const v = cleanMerchant(at);
    if (!looksLikeAccountRef(v)) return v;
  }
  const debitedTo = /debited\s+(?:to|from|at)\s+([A-Za-z0-9 .&]+?)(?=\s+(?:using|on|via|upi|ref|avl|available|\.|$))/i.exec(text);
  if (debitedTo) {
    const v = cleanMerchant(debitedTo[1]!);
    if (!looksLikeAccountRef(v)) return v;
  }
  const spentAt = /(?:spent|used|purchase of|paid at)\s+([A-Za-z0-9 .&]+?)(?=\s+(?:using|on|via|upi|ref|\.|$))/i.exec(text);
  if (spentAt) {
    const v = cleanMerchant(spentAt[1]!);
    if (!looksLikeAccountRef(v)) return v;
  }
  // Indian Bank outgoing: "Sent Rs.5.00 from A/c *3953 on 02-09-26 to HARISH RAGAV".
  // Recipient names may be ALL-CAPS or title-case, optionally with a title
  // (Mr/Ms/Mrs/M-S) and possibly single-letter initials.
  const sentTo = new RegExp(`\\bsent\\b[\\s\\S]*?\\bto\\s+(.+?)(?=${PARTY_NAME_BOUNDARY.source})`, "i").exec(text);
  if (sentTo) {
    const v = cleanPartyName(sentTo[1]!);
    if (v && !looksLikeAccountRef(v)) return v;
  }
  return null;
}

/** Extract counterparty (inflow source) from common phrasings. */
function extractCounterparty(text: string): string | null {
  const from = /(?:from|fr)\s+([A-Za-z0-9 .&]+?)(?=\s+(?:using|on|via|upi|ref|\.|$))/i.exec(text);
  if (from) {
    const v = cleanMerchant(from[1]!);
    if (!looksLikeAccountRef(v)) return v;
  }
  const creditedBy = /credited\s+(?:by|from)\s+([A-Za-z0-9 .&]+?)(?=\s+(?:using|on|via|upi|ref|\.|$))/i.exec(text);
  if (creditedBy) {
    const v = cleanMerchant(creditedBy[1]!);
    if (!looksLikeAccountRef(v)) return v;
  }
  // Indian Bank incoming: "credited with Rs.5.00 on 02-09-26 by HARISH RAGAV".
  // Sender names may be ALL-CAPS or title-case, optionally with a title
  // (Mr/Ms/Mrs/M-S) and possibly single-letter initials.
  const creditedWithBy = new RegExp(`\\bcredited\\b[\\s\\S]*?\\bby\\s+(.+?)(?=${PARTY_NAME_BOUNDARY.source})`, "i").exec(text);
  if (creditedWithBy) {
    const v = cleanPartyName(creditedWithBy[1]!);
    if (v && !looksLikeAccountRef(v)) return v;
  }
  return null;
}

function inferPaymentMethod(text: string): SmsPaymentMethodKind {
  const lower = text.toLowerCase();
  if (/(upi|upi payment)/.test(lower)) return "upi";
  if (/(credit card|debit card|card xxxx|card)/i.test(text)) return "card";
  if (/(a\/c|account|acct|withdrawn)/i.test(lower)) return "bank";
  return "wallet";
}

/**
 * Generic Indian bank / UPI / credit-card parser. This is the safety net
 * covering most formats; bank-specific parsers refine or override it.
 */
export const genericParser: SmsParser = {
  id: "generic",
  matches: () => true,

  parse(message) {
    const text = message.body;
    const amount = parseAmount(text);
    if (!amount) return null;

    const direction = directionOf(text);
    if (direction === "unknown") return null;

    const merchant = extractMerchant(text);
    const counterparty = extractCounterparty(text);
    const upiRef = extractRef(text, "upi");
    const bankRef = extractRef(text, "bank");

    return {
      amountMinor: amount.amountMinor,
      currency: amount.currency,
      direction,
      merchant,
      counterparty,
      transactionDate: parseDateString(text),
      accountRef: extractMaskedAccountRef(text),
      upiRef,
      bankRef,
      paymentMethodKind: inferPaymentMethod(text),
      ambiguous: amount.ambiguous,
    };
  },
};

/** SBI-specific formatting refinements. */
export const sbiParser: SmsParser = {
  id: "sbi",
  matches: (m) => /SBI\b|State Bank/i.test(`${m.sender ?? ""} ${m.body}`),
  parse(message) {
    const text = message.body;
    const base = genericParser.parse(message);
    if (!base) return null;
    if (!base.merchant) {
      const atm = /(?:withdrawn from|paid at|spent at)\s+([A-Za-z0-9 .]+?)(?=\s+(?:on|ref|\.|$))/i.exec(text);
      if (atm) return { ...base, merchant: cleanMerchant(atm[1]!) };
    }
    return base;
  },
};

/** HDFC parser (refinement only; generic covers most HDFC formats). */
export const hdfcParser: SmsParser = {
  id: "hdfc",
  matches: (m) => /HDFC/i.test(`${m.sender ?? ""} ${m.body}`),
  parse(message) {
    return genericParser.parse(message);
  },
};

/** ICICI parser (refinement only). */
export const iciciParser: SmsParser = {
  id: "icici",
  matches: (m) => /ICICI/i.test(`${m.sender ?? ""} ${m.body}`),
  parse(message) {
    return genericParser.parse(message);
  },
};

/** PhonePe UPI parser. */
export const phonePeParser: SmsParser = {
  id: "phonepe",
  matches: (m) => /PhonePe/i.test(`${m.sender ?? ""} ${m.body}`),
  parse(message) {
    const base = genericParser.parse(message);
    if (!base) return null;
    return { ...base, paymentMethodKind: "upi" };
  },
};

/** Google Pay UPI parser. */
export const gPayParser: SmsParser = {
  id: "gpay",
  matches: (m) => /Google Pay|GPay/i.test(`${m.sender ?? ""} ${m.body}`),
  parse(message) {
    const base = genericParser.parse(message);
    if (!base) return null;
    return { ...base, paymentMethodKind: "upi" };
  },
};

/** Ordered set of parsers; first to produce fields wins. */
export const PARSERS: SmsParser[] = [
  sbiParser,
  hdfcParser,
  iciciParser,
  phonePeParser,
  gPayParser,
  genericParser,
];
