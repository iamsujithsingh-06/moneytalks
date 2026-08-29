/**
 * Receipt normalization helpers: currency-aware amount parsing, total
 * detection, date parsing and merchant cleanup.
 *
 * Receipts are noisy: ₹, Rs., INR, commas, Indian digit grouping, decimals,
 * and multiple amounts (subtotal, tax, discount, item prices, total). We parse
 * conservatively, prefer a clearly-labelled final TOTAL, and never guess the
 * total when several amounts are equally plausible (the engine routes those to
 * review instead of inventing a transaction).
 */

export interface AmountParse {
  amountMinor: number;
  currency: string;
}

export interface AmountMatch extends AmountParse {
  /** Rough tokens around the match, used for label/context detection. */
  context: string;
  line: string;
  index: number;
}

const CURRENCY_BY_SYMBOL: Record<string, string> = {
  "₹": "INR",
  "rs.": "INR",
  "rs": "INR",
  "inr": "INR",
  "rupees": "INR",
  "$": "USD",
  "usd": "USD",
  "€": "EUR",
  "eur": "EUR",
  "£": "GBP",
  "gbp": "GBP",
};

/** Unambiguous labels on the same line that mark the FINAL payable total. */
const TOTAL_MARKERS =
  /(?:^|\b)(?:grand\s+total|total|payable|amount\s+due|balance\s+due|net\s+amount|bill\s+total|final\s+(?:amount|total)|to\s+pay|due)\b(\s*[:.\-–—]|\b)/i;

/** Normalize unicode digits to ASCII. */
function normalizeDigits(input: string): string {
  return input
    .replace(/[０-９]/g, (c) => String(c.charCodeAt(0) - 0xff10))
    .replace(/[,\s]/g, "");
}

/**
 * Parse a single money token like "₹1,234.50", "Rs 500", "INR 1,000",
 * "1234.50" or "1,23,456.78". Returns minor units or null.
 */
export function parseMoneyToken(token: string): AmountParse | null {
  const m =
    /(?:₹|rs\.?|inr|rupees?|\$|usd|€|eur|£|gbp)?\s*(\d{1,3}(?:[,\s]\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/i.exec(
      token,
    );
  if (!m) return null;
  const digits = normalizeDigits(m[1]!);
  if (!/^\d+(\.\d{1,2})?$/.test(digits)) return null;
  const [whole, frac = ""] = digits.split(".");
  const amountMinor = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return null;

  const symbolMatch = /(₹|rs\.?|inr|rupees?|\$|usd|€|eur|£|gbp)/i.exec(token);
  const currency = symbolMatch
    ? CURRENCY_BY_SYMBOL[symbolMatch[1]!.toLowerCase().replace(/\.$/, "")] ?? "INR"
    : "INR";
  return { amountMinor, currency };
}

/** Match a currency-symbol-prefixed amount (₹540.00, Rs 500, $99.99). */
const CURRENCY_AMOUNT =
  /(?:₹|rs\.?|rupees?|inr|\$|usd|€|eur|£|gbp)\s*\d{1,3}(?:[,\s]?\d{3})*(?:\.\d{1,2})?/gi;

/** Match a bare amount that is not glued to other digits/letters/currency. */
const BARE_AMOUNT =
  /(?<![\w₹$€£])(?:\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/g;

/** Remove date-like substrings so their digits are never parsed as amounts. */
function stripDates(line: string): string {
  return line.replace(
    /(?:\d{4}[/\-.]\d{1,2}[/\-.]\d{1,2}|\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/g,
    " ",
  );
}

/**
 * Collect every money value found in `text`, each with its line and a small
 * context window (for total/label detection in the parser). Dates are stripped
 * first so "12/05/2026" never yields bogus amounts, and money tokens are read
 * as whole numbers rather than being fragmented on every digit.
 */
export function collectAmounts(text: string): AmountMatch[] {
  const lines = text.split(/\r?\n/);
  const out: AmountMatch[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!.trim();
    const stripped = stripDates(line);
    if (!stripped) continue;
    const seen = new Set<number>();
    for (const m of stripped.matchAll(CURRENCY_AMOUNT)) {
      pushCandidate(m[0]!, seen, out, line, i);
    }
    for (const m of stripped.matchAll(BARE_AMOUNT)) {
      pushCandidate(m[0]!, seen, out, line, i);
    }
  }
  return out;
}

function pushCandidate(
  token: string,
  seen: Set<number>,
  out: AmountMatch[],
  line: string,
  lineIndex: number,
): void {
  const parsed = parseMoneyToken(token);
  if (!parsed) return;
  if (seen.has(parsed.amountMinor)) return;
  seen.add(parsed.amountMinor);
  out.push({
    ...parsed,
    line,
    context: line.slice(-60),
    index: lineIndex,
  });
}

/** Pick the FINAL payable total from a set of amounts, or null if ambiguous. */
export function pickTotal(amounts: AmountMatch[]): AmountMatch | null {
  if (amounts.length === 0) return null;
  if (amounts.length === 1) return amounts[0]!;

  // Prefer the amount whose line carries an unambiguous TOTAL marker and which
  // is the largest value on that (typically the last) line.
  const marked = amounts.filter((a) => TOTAL_MARKERS.test(a.line));
  if (marked.length === 1) return marked[0]!;

  // Multiple distinct totals labelled → ambiguous (review).
  if (marked.length > 1) {
    const distinct = new Set(marked.map((a) => a.amountMinor));
    if (distinct.size === 1) return marked[0]!;
    return null;
  }

  // No labelled total: never assume first/largest. Caller flags ambiguity.
  return null;
}

/** Parse a receipt date from common layouts (DD/MM/YYYY, MM/DD/YYYY, named). */
export function parseReceiptDate(text: string, today?: Date): string | null {
  void today;
  const iso = /(?:^|\D)(\d{4})-(\d{1,2})-(\d{1,2})(?:\D|$)/.exec(text);
  if (iso) {
    const [, y, m, d] = iso;
    if (isValid(y!, m!, d!)) return `${y}-${pad(m!)}-${pad(d!)}`;
  }
  const dmy = /(?:^|\D)(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})(?:\D|$)/.exec(text);
  if (dmy) {
    const [, dd, mm, yy] = dmy;
    const year = yy!.length === 2 ? `20${yy}` : yy;
    // Prefer first as day when both plausible; for receipts DD/MM is usual.
    if (isValid(year!, mm!, dd!)) return `${year}-${pad(mm!)}-${pad(dd!)}`;
  }
  const named =
    /(?:^|\D)(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{2,4})(?:\D|$)/i.exec(
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
      return `${year}-${months[mon!.toLowerCase()]!}-${pad(dd!)}`;
    }
  }
  return null;
}

/** Extract an invoice / reference number when present. */
export function extractReceiptReference(text: string): string | null {
  const patterns = [
    /(?:invoice|inv|bill|receipt|order|ref|reference)\s*(?:no\.?|number|#|id)?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-/]{3,25})/i,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) return m[1]!.trim();
  }
  return null;
}

/** Clean a merchant/company name found in the receipt header. */
export function cleanMerchant(input: string): string {
  return input
    .replace(/\s+/g, " ")
    .replace(/^[:\-–—|\s]+/, "")
    .replace(/[:\-–—|\s]+$/, "")
    .trim();
}

function pad(n: string): string {
  return n.padStart(2, "0");
}

function isValid(year: string, month: string, day: string): boolean {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (m < 1 || m > 12) return false;
  const days = new Date(y, m, 0).getDate();
  return d >= 1 && d <= days;
}
