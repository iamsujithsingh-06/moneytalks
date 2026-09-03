/**
 * Normalization helpers: currency-aware amount parsing and calendar parsing.
 *
 * Indian bank/UPI SMS formats vary a lot (₹, R, Rs., INR, commas, decimals,
 * Unicode digits). We parse conservatively and never guess when ambiguous.
 */

export interface AmountParse {
  amountMinor: number;
  currency: string;
}

const CURRENCY_BY_SYMBOL: Record<string, string> = {
  "₹": "INR",
  "rs.": "INR",
  "rs": "INR",
  "inr": "INR",
  "$": "USD",
  "€": "EUR",
  "£": "GBP",
};

/** Unicode + ASCII decimal digits → ASCII digits. */
function normalizeDigits(input: string): string {
  return input.replace(/[０-９]/g, (c) =>
    String(c.charCodeAt(0) - 0xff10),
  );
}

/**
 * Words that mark the money-moved transaction amount (as opposed to a
 * trailing available-balance figure). Real SMS read e.g.
 * "Rs.3,456.00 debited ... Avl Bal Rs.12,000.00".
 */
const TRANSACTION_KEYWORDS =
  /(?:debited|credited|credit|debit|paid|pay|spent|used|received|recvd|withdrawn|refund|reversed|purchase|purchased|charged|transferred|sent|added|deducted)/i;

/** Words that introduce an available/closing balance figure, not a txn. */
const BALANCE_KEYWORDS =
  /(?:available balance|avl\s+bal|avl\s*\.?bal|balance\s*:|account balance|closing balance|cr\s+bal|curr\s+bal)/i;

/** Result of parsing an amount, possibly flagged for review. */
export type AmountParseResult = AmountParse & { ambiguous: boolean };

/** Parse all currency amounts present in `text`, with local index/context. */
interface MatchWithContext {
  index: number;
  end: number;
  context: string;
  result: AmountParse;
}

function collectAmounts(text: string): MatchWithContext[] {
  const normalized = normalizeDigits(text);
  const moneyRe =
    /(?<![\d.])\s*(?:₹|inr|rs\.?)\s*(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?\b/gi;
  const out: MatchWithContext[] = [];
  let match: RegExpExecArray | null;
  const searchable = normalized;
  while ((match = moneyRe.exec(searchable)) !== null) {
    const major = Number(match[1]!.replace(/,/g, ""));
    if (!Number.isFinite(major) || major <= 0) continue;
    const decimals = (match[2] ?? "").padEnd(2, "0").slice(0, 2);
    const currencyMatch = /(₹|inr|rs\.?)/i.exec(match[0]!);
    out.push({
      index: match.index,
      end: match.index + match[0].length,
      context: searchable.slice(
        Math.max(0, match.index - 48),
        Math.min(searchable.length, match.index + match[0].length + 24),
      ),
      result: {
        amountMinor: major * 100 + Number(decimals),
        currency: currencyMatch ? CURRENCY_BY_SYMBOL[currencyMatch[1]!.toLowerCase()] ?? "INR" : "INR",
      },
    });
  }
  return out;
}

/**
 * Parse an amount from a string like "₹1,234.50", "Rs 500", "INR 1,000".
 * Returns minor units (amount * 10^decimals).
 *
 * When several amounts appear we do NOT blindly trust the first. We prefer
 * the amount tied to a transaction keyword ("debited", "paid", "credited",
 * "spent", "received", ...) and skip a clearly-labelled trailing
 * "Available Balance" figure. When multiple amounts remain genuinely
 * ambiguous (none keyword-marked and none a balance line) we return
 * `ambiguous: true` so the engine can route to review instead of guessing.
 * Returns null only when no confidently-parsed amount exists.
 */
export function parseAmount(text: string): AmountParseResult | null {
  const all = collectAmounts(text);
  if (all.length === 0) return null;
  if (all.length === 1) return { ...all[0]!.result, ambiguous: false };

  const isBalance = (m: MatchWithContext) => BALANCE_KEYWORDS.test(m.context);
  const isTxn = (m: MatchWithContext) => TRANSACTION_KEYWORDS.test(m.context);
  const nonBalance = all.filter((m) => !isBalance(m));

  // Prefer the amount whose context carries a transaction keyword.
  const txn = nonBalance.filter(isTxn);
  if (txn.length === 1) return { ...txn[0]!.result, ambiguous: false };
  if (txn.length > 1) return { ...txn[0]!.result, ambiguous: true };

  // Fall back to the first non-balance amount when unique, else flag ambiguity.
  if (nonBalance.length === 1) return { ...nonBalance[0]!.result, ambiguous: false };
  return { ...all[0]!.result, ambiguous: true };
}

/**
 * Parse an embedded ISO-ish or Indian locale date (YYYY-MM-DD, DD-MM-YYYY,
 * DD/MM/YYYY, "28 Aug 2026", "28/08/26"). Returns "YYYY-MM-DD" or null.
 */
export function parseDateString(text: string, today?: Date): string | null {
  const t = today ?? new Date();

  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) {
    const [, y, m, d] = iso;
    if (isValid(y!, m!, d!)) return `${y}-${m}-${d}`;
  }

  const dmy = /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/.exec(text);
  if (dmy) {
    const [, dd, mm, yy] = dmy;
    const year = yy!.length === 2 ? `20${yy}` : yy;
    if (isValid(year!, mm!, dd!)) return `${year}-${mm!.padStart(2, "0")}-${dd!.padStart(2, "0")}`;
  }

  const named =
    /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{2,4})/i.exec(
      text,
    );
  if (named) {
    const months: Record<string, string> = {
      jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
      jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
    };
    const [, dd, mon, yy] = named;
    const year = yy!.length === 2 ? `20${yy}` : yy;
    if (isValid(year!, months[mon!.toLowerCase()]!, dd!)) {
      return `${year}-${months[mon!.toLowerCase()]!}-${dd!.padStart(2, "0")}`;
    }
  }

  // Bare DD/MM or MM/DD are too ambiguous; require at least a year.
  void t;
  return null;
}

function isValid(year: string, month: string, day: string): boolean {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (m < 1 || m > 12) return false;
  const daysInMonth = new Date(y, m, 0).getDate();
  if (d < 1 || d > daysInMonth) return false;
  return true;
}

/** Clean a merchant/payee: collapse whitespace and trim known prefixes. */
export function cleanMerchant(input: string): string {
  return input
    .replace(/\s+/g, " ")
    .replace(/^[:\-–—\s]+/, "")
    .replace(/[:\-–—\s]+$/, "")
    .trim();
}

/** Extract a masked account/card reference like "A/c **1234" or "Card xxxx 1234". */
export function extractMaskedAccountRef(text: string): string | null {
  const acNo = /(?:A\/c|A\/C|acct|account)\s*[*xX]?\s*\*{2,}(\d{2,4})/.exec(text);
  if (acNo) return `****${acNo[1]}`;
  const card = /card\s+(?:x{2,4}|\*{2,})\s*(\d{4})/i.exec(text);
  if (card) return `****${card[1]}`;
  // Generic "xx1234" or "**1234"
  const generic = /(?:\*{2,}|x{2,}|xx)(\d{2,4})\b/.exec(text);
  if (generic) return `****${generic[1]}`;
  return null;
}

/** Extract a UPI reference / transaction id when present. */
export function extractRef(text: string, label: "upi" | "bank"): string | null {
  const patterns: Record<string, RegExp[]> = {
    upi: [
      /\bupi(?: ref| reference)?\s*[:#]?\s*([A-Za-z0-9]{6,20})/i,
      /\bref(?: no| number| id)?\s*[:#]?\s*(\d{6,20})/i,
    ],
    bank: [
      /\b(?:bankref|bank ref|txn id|transaction id|trn id|ref no|reference no)\s*[:#]?\s*([A-Za-z0-9]{6,30})/i,
      // Indian Bank (and others) use an "RRN <number>" transaction reference.
      /\brrn\s*[:#]?\s*(\d{6,30})/i,
    ],
  };
  for (const re of patterns[label] ?? []) {
    const m = re.exec(text);
    if (m) return m[1]!.trim();
  }
  return null;
}
