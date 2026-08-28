export const MINOR_AMOUNT_MAX = 1_000_000_000_000;

export const SUPPORTED_CURRENCIES = [
  "INR",
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "AUD",
  "CAD",
  "CHF",
  "CNY",
  "HKD",
  "NZD",
  "SGD",
  "AED",
  "BHD",
  "KWD",
  "MYR",
  "NPR",
  "PKR",
  "QAR",
  "SAR",
  "THB",
  "TRY",
  "ZAR",
  "LKR",
  "BDT",
  "KRW",
  "TWD",
  "IDR",
  "RUB",
  "BRL",
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

const ZERO_DECIMAL_CURRENCIES = new Set(["JPY"]);

export function minorUnitsPerMajor(currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.trim().toUpperCase()) ? 0 : 2;
}

export function isValidMinorUnitsAmount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MINOR_AMOUNT_MAX
  );
}

export function isPositiveMinorUnitsAmount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= MINOR_AMOUNT_MAX
  );
}

export function toMinorUnits(amount: string | number, currency: string): number {
  const decimals = minorUnitsPerMajor(currency);
  const major =
    typeof amount === "number" ? amount.toFixed(decimals) : amount.trim();
  const pattern =
    decimals === 0
      ? /^\d+$/
      : new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`);
  if (!pattern.test(major)) {
    throw new RangeError(
      `Amount "${amount}" is not a valid ${currency} major-unit value (max ${decimals} decimal places)`,
    );
  }
  const parts = major.split(".");
  const whole = parts[0] ?? "";
  const fraction = parts[1] ?? "";
  const minor =
    Number(whole) * 10 ** decimals + Number(fraction.padEnd(decimals, "0"));
  if (!isValidMinorUnitsAmount(minor)) {
    throw new RangeError("Amount is too large to store as integer minor units");
  }
  return minor;
}

export function fromMinorUnits(amountMinor: number, currency: string): string {
  if (!isValidMinorUnitsAmount(amountMinor)) {
    throw new RangeError("amountMinor must be a non-negative safe integer");
  }
  const decimals = minorUnitsPerMajor(currency);
  return (amountMinor / 10 ** decimals).toFixed(decimals);
}
