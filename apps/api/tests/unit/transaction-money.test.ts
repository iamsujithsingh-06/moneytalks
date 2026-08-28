import { describe, expect, it } from "vitest";
import {
  MINOR_AMOUNT_MAX,
  SUPPORTED_CURRENCIES,
  deriveTransactionDirection,
  fromMinorUnits,
  isValidMinorUnitsAmount,
  isPositiveMinorUnitsAmount,
  minorUnitsPerMajor,
  toMinorUnits,
} from "@moneytalks/shared";

describe("minorUnitsPerMajor", () => {
  it("uses 2 decimal places for most currencies", () => {
    expect(minorUnitsPerMajor("INR")).toBe(2);
    expect(minorUnitsPerMajor("USD")).toBe(2);
    expect(minorUnitsPerMajor("EUR")).toBe(2);
  });

  it("uses 0 decimal places for JPY", () => {
    expect(minorUnitsPerMajor("JPY")).toBe(0);
    expect(minorUnitsPerMajor("jpy")).toBe(0);
  });

  it("defaults unknown currencies to 2", () => {
    expect(minorUnitsPerMajor("ZZZ")).toBe(2);
  });
});

describe("amount checks (integer minor units, no floats)", () => {
  it("accepts non-negative safe integers", () => {
    expect(isValidMinorUnitsAmount(0)).toBe(true);
    expect(isValidMinorUnitsAmount(1)).toBe(true);
    expect(isValidMinorUnitsAmount(MINOR_AMOUNT_MAX)).toBe(true);
  });

  it("rejects floats, negatives, non-finite and oversized values", () => {
    expect(isValidMinorUnitsAmount(1.5)).toBe(false);
    expect(isValidMinorUnitsAmount(-1)).toBe(false);
    expect(isValidMinorUnitsAmount(Number.NaN)).toBe(false);
    expect(isValidMinorUnitsAmount(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidMinorUnitsAmount(MINOR_AMOUNT_MAX + 1)).toBe(false);
  });

  it("rejects non-number values", () => {
    expect(isValidMinorUnitsAmount("100")).toBe(false);
    expect(isValidMinorUnitsAmount(null)).toBe(false);
    expect(isValidMinorUnitsAmount(undefined)).toBe(false);
  });

  it("requires positive amounts for ledger entries", () => {
    expect(isPositiveMinorUnitsAmount(1)).toBe(true);
    expect(isPositiveMinorUnitsAmount(MINOR_AMOUNT_MAX)).toBe(true);
    expect(isPositiveMinorUnitsAmount(0)).toBe(false);
    expect(isPositiveMinorUnitsAmount(-5)).toBe(false);
    expect(isPositiveMinorUnitsAmount(1.5)).toBe(false);
  });
});

describe("toMinorUnits", () => {
  it("converts major amounts to integer minor units", () => {
    expect(toMinorUnits("10.00", "INR")).toBe(1000);
    expect(toMinorUnits("123.45", "USD")).toBe(12345);
    expect(toMinorUnits("0.01", "INR")).toBe(1);
    expect(toMinorUnits(10, "INR")).toBe(1000);
    expect(toMinorUnits("10", "INR")).toBe(1000);
  });

  it("handles zero-decimal currencies", () => {
    expect(toMinorUnits("10", "JPY")).toBe(10);
    expect(toMinorUnits(10, "JPY")).toBe(10);
  });

  it("rejects values with too many decimal places", () => {
    expect(() => toMinorUnits("10.999", "INR")).toThrow(RangeError);
    expect(() => toMinorUnits("10.5", "JPY")).toThrow(RangeError);
  });

  it("rejects malformed or oversized amounts", () => {
    expect(() => toMinorUnits("abc", "INR")).toThrow(RangeError);
    expect(() => toMinorUnits("-10", "INR")).toThrow(RangeError);
    expect(() => toMinorUnits("99999999999999", "INR")).toThrow(RangeError);
  });
});

describe("fromMinorUnits", () => {
  it("formats minor units back to major units", () => {
    expect(fromMinorUnits(1000, "INR")).toBe("10.00");
    expect(fromMinorUnits(12345, "USD")).toBe("123.45");
    expect(fromMinorUnits(10, "JPY")).toBe("10");
  });

  it("rejects invalid minor-unit values", () => {
    expect(() => fromMinorUnits(-1, "INR")).toThrow(RangeError);
    expect(() => fromMinorUnits(1.5, "INR")).toThrow(RangeError);
  });
});

describe("supported currencies", () => {
  it("includes the core currencies", () => {
    expect(SUPPORTED_CURRENCIES).toContain("INR");
    expect(SUPPORTED_CURRENCIES).toContain("USD");
    expect(SUPPORTED_CURRENCIES).toContain("EUR");
    expect(SUPPORTED_CURRENCIES).toContain("JPY");
    expect(SUPPORTED_CURRENCIES.length).toBeGreaterThanOrEqual(20);
  });
});

describe("deriveTransactionDirection", () => {
  it("derives fixed directions from type", () => {
    expect(deriveTransactionDirection("income")).toBe("inflow");
    expect(deriveTransactionDirection("expense")).toBe("outflow");
    expect(deriveTransactionDirection("refund")).toBe("inflow");
  });

  it("allows explicit direction for transfer and adjustment", () => {
    expect(deriveTransactionDirection("transfer", "outflow")).toBe("outflow");
    expect(deriveTransactionDirection("adjustment", "outflow")).toBe("outflow");
  });

  it("defaults transfer and adjustment to inflow", () => {
    expect(deriveTransactionDirection("transfer")).toBe("inflow");
    expect(deriveTransactionDirection("adjustment")).toBe("inflow");
  });
});
