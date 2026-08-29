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
