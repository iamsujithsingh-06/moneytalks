import { minorUnitsPerMajor } from "@moneytalks/shared";

/** Format an integer minor-unit amount for display with tabular numerals. */
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
  const sign = opts.sign ?? "auto";
  if (amountMinor < 0) return `−${abs}`;
  if (sign === "always") return `+${abs}`;
  return opts.sign === "auto" ? abs : abs;
}

/** Absolute (unsigned) formatted amount, e.g. for the amount column. */
export function formatAmount(amountMinor: number, currency: string): string {
  return formatMoney(amountMinor, currency);
}

/** Short format for charts/large figures, e.g. ₹1.2L (lakh) or K.
 * Uses Indian grouping faithfully where meaningful. */
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

export function formatMonthKey(period: string): string {
  // period like "2026-03"
  const [y, m] = period.split("-");
  if (!y || !m) return period;
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const mi = Number(m) - 1;
  return `${months[mi] ?? m} ${y}`;
}
