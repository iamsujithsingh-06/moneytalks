import { minorUnitsPerMajor } from "@moneytalks/shared";

export function formatMoney(
  amountMinor: number,
  currency: string,
  opts: { sign?: "always" | "never" | "auto" } = {},
): string {
  const precision = minorUnitsPerMajor(currency);
  const value = amountMinor / 10 ** precision;
  const formatter = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
  const abs = formatter.format(Math.abs(value));
  if (amountMinor < 0) return `−${abs}`;
  if (opts.sign === "always") return `+${abs}`;
  return abs;
}

export function formatAmount(amountMinor: number, currency: string): string {
  return formatMoney(amountMinor, currency);
}

/**
 * Display-only signed amount (minor units): income/refund render positive
 * ("+"), expenses render negative ("−"). This never touches balance
 * calculation or storage — it only gives the display formatters the sign.
 */
export function signedMinorAmount(
  type: string,
  direction: string | null | undefined,
  amountMinor: number,
): number {
  const inflow =
    direction === "inflow" ||
    (direction == null && (type === "income" || type === "refund"));
  return inflow ? Math.abs(amountMinor) : -Math.abs(amountMinor);
}

export function formatCompact(amountMinor: number, currency: string): string {
  const symbol = currencySymbol(currency);
  const precision = minorUnitsPerMajor(currency);
  const value = amountMinor / 10 ** precision;
  const abs = Math.abs(value);
  let scaled: string;
  let suffix = "";
  if (abs >= 1_00_00_000) {
    scaled = (abs / 1_00_00_000).toFixed(1);
    suffix = "Cr";
  } else if (abs >= 1_00_000) {
    scaled = (abs / 1_00_000).toFixed(1);
    suffix = "L";
  } else if (abs >= 1_000) {
    scaled = (abs / 1_000).toFixed(1);
    suffix = "K";
  } else {
    scaled = abs.toFixed(precision);
  }
  const sign = amountMinor < 0 ? "−" : "";
  return `${sign}${symbol}${scaled.replace(/\.0$/, "")}${suffix}`;
}

export function currencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    INR: "₹",
    USD: "$",
    EUR: "€",
    GBP: "£",
    JPY: "¥",
  };
  return symbols[currency] ?? `${currency} `;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

const INCOME_TYPES = new Set(["income", "refund"]);

/**
 * Is the transaction an automatic capture (SMS / OCR / receipt)?
 * Manual entries (source === "manual") are NOT automatic.
 */
export function isAutoTransaction(input: {
  source: string | null | undefined;
}): boolean {
  return input.source === "sms" || input.source === "ocr";
}

function transactionKind(input: { type: string | null | undefined }): "income" | "expense" {
  return input.type && INCOME_TYPES.has(input.type) ? "income" : "expense";
}

/**
 * The primary party line for a transaction row.
 * - expense → "Sent to {merchant}" (falls back to note, then "Payment")
 * - income → "Received from {counterparty}" (falls back to note, then "Income")
 * Never returns undefined/null/empty.
 */
export function formatTransactionLine(input: {
  type: string | null | undefined;
  merchant: string | null | undefined;
  counterparty: string | null | undefined;
  note: string | null | undefined;
}): string {
  const income = transactionKind(input) === "income";
  const name = (income ? input.counterparty : input.merchant) ?? input.note ?? "";
  if (name.trim()) {
    return income ? `Received from ${name.trim()}` : `Sent to ${name.trim()}`;
  }
  return income ? "Income" : "Payment";
}

/**
 * The bare party name for a transaction row (no direction prefix).
 * - expense → merchant (falls back to note, then "—")
 * - income → counterparty (falls back to note, then "—")
 * Never returns undefined/null; trims whitespace.
 */
function partyName(input: {
  type?: string | null;
  merchant: string | null | undefined;
  counterparty: string | null | undefined;
  note: string | null | undefined;
}): string {
  const income = INCOME_TYPES.has(input.type ?? "");
  const name = (income ? input.counterparty : input.merchant) ?? input.note ?? "";
  const trimmed = name.trim();
  return trimmed || "—";
}

export { partyName as formatPartyName };

function paymentMethodLabel(input: {
  paymentMethodKind?: unknown;
  upiRef?: unknown;
}): string | null {
  const kind = input.paymentMethodKind;
  if (kind === "upi" || input.upiRef) return "UPI";
  if (kind === "card") return "Card";
  if (kind === "wallet") return "Wallet";
  if (kind === "bank") return "Bank transfer";
  return null;
}

/**
 * Source / payment-method label for a transaction row.
 * - manual → "Manual"
 * - ocr/receipt → "Auto • Receipt"
 * - sms → "Auto • UPI" (or Card/Wallet/Bank transfer when detected in data)
 */
export function formatSourceLabel(input: {
  source: string | null | undefined;
  paymentMethodKind?: unknown;
  upiRef?: unknown;
}): string {
  if (input.source === "manual") return "Manual";
  if (input.source === "ocr") return "Auto • Receipt";
  if (input.source === "sms") {
    const method = paymentMethodLabel(input) ?? "UPI";
    return `Auto • ${method}`;
  }
  return "Manual";
}

/**
 * Extract a calendar date (the first YYYY-MM-DD) from a value that may be a
 * bare date ("2026-09-03") or a full ISO timestamp ("2026-09-03T00:00:00.000Z").
 * Returns null when no reliable date is present.
 */
function extractDateKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^\s*(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const [, y, mo, d] = m;
  const day = new Date(Number(y), Number(mo) - 1, Number(d));
  if (Number.isNaN(day.getTime())) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * Combine the transaction's calendar date (transactionDate — either a bare
 * YYYY-MM-DD or a full ISO timestamp such as "2026-09-03T00:00:00.000Z") with
 * the exact time of a stored timestamp (createdAt/updatedAt), rendered in the
 * device's LOCAL timezone, e.g. "3 Sept 2026 • 9:07 AM". The date always comes
 * from transactionDate; the TIME always comes from the supplied timestamp
 * (updatedAt/event time), never from a UTC-midnight transactionDate. Does NOT
 * modify the stored values. Falls back to the date alone if the timestamp is
 * unusable, and to a safe placeholder if the date is unusable — never
 * undefined/null text.
 */
export function formatFullDateTime(
  dateKey: string | null | undefined,
  timeIso: string | null | undefined,
): string {
  const time = timeIso ? new Date(timeIso) : null;
  const hasTime = !!time && !Number.isNaN(time.getTime());

  const dateOnly = extractDateKey(dateKey);
  let iso = dateOnly ? `${dateOnly}T00:00:00.000Z` : String(dateKey ?? "");

  if (dateOnly && hasTime) {
    const [y, m, d] = dateOnly.split("-").map((p) => Number(p));
    const local = new Date(y!, m! - 1, d!, time!.getHours(), time!.getMinutes(), time!.getSeconds());
    iso = local.toISOString();
  }

  const date = formatDate(iso);
  if (!hasTime) return date || "No date";
  return `${date || "No date"} • ${formatTime(iso).toUpperCase()}`;
}
