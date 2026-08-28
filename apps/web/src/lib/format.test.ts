import { describe, expect, it } from "vitest";
import {
  formatAmount,
  formatCompact,
  formatDate,
  formatMoney,
  formatMonthKey,
  currencySymbol,
} from "./format.js";

describe("formatMoney", () => {
  it("formats INR minor units with Indian grouping", () => {
    expect(formatMoney(123456789, "INR")).toBe("₹12,34,567.89");
  });

  it("formats with two decimals for INR", () => {
    expect(formatMoney(1234500, "INR")).toBe("₹12,345.00");
  });

  it("prefixes a minus sign for negatives", () => {
    expect(formatMoney(-1234500, "INR")).toBe("−₹12,345.00");
  });

  it("renders an explicit + when sign is always", () => {
    expect(formatMoney(1234500, "INR", { sign: "always" })).toBe("+₹12,345.00");
  });

  it("uses zero precision for JPY", () => {
    expect(formatMoney(12345, "JPY")).toBe("¥12,345");
  });
});

describe("formatAmount", () => {
  it("matches formatMoney output", () => {
    expect(formatAmount(1500, "INR")).toBe(formatMoney(1500, "INR"));
  });
});

describe("formatCompact", () => {
  it("uses Cr for crores", () => {
    expect(formatCompact(1234567890, "INR")).toBe("₹1.2Cr");
  });

  it("uses L for lakhs", () => {
    expect(formatCompact(123456789, "INR")).toBe("₹12.3L");
  });

  it("uses K for thousands", () => {
    expect(formatCompact(1234500, "INR")).toBe("₹12.3K");
  });

  it("drops a trailing zero in the scaled suffix", () => {
    expect(formatCompact(2_00_00_000, "INR")).toBe("₹2L");
  });

  it("formats small values with exact precision", () => {
    expect(formatCompact(500, "INR")).toBe("₹5.00");
  });

  it("prefixes minus for negative compact values", () => {
    expect(formatCompact(-123456789, "INR")).toBe("−₹12.3L");
  });
});

describe("currencySymbol", () => {
  it("maps known currencies to symbols", () => {
    expect(currencySymbol("INR")).toBe("₹");
    expect(currencySymbol("USD")).toBe("$");
  });

  it("falls back to the code for unknown currencies", () => {
    expect(currencySymbol("XYZ")).toBe("XYZ ");
  });
});

describe("formatDate", () => {
  it("formats a valid ISO date", () => {
    expect(formatDate("2026-03-15")).toBe("15 Mar 2026");
  });

  it("returns input unchanged for invalid dates", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });
});

describe("formatMonthKey", () => {
  it("formats a yyyy-mm period", () => {
    expect(formatMonthKey("2026-03")).toBe("Mar 2026");
  });

  it("returns input unchanged for a malformed period", () => {
    expect(formatMonthKey("garbage")).toBe("garbage");
  });
});
