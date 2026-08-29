import { describe, expect, it } from "vitest";
import { parseMoneyToken } from "./normalize.js";

/**
 * Amount normalization checks. `parseMoneyToken` returns minor units, so
 * "50.00" -> { amountMinor: 5000 } represents 50 in whatever currency.
 *
 *   unit form     -> minor units
 *   "50.00"       -> 5000   (50)
 *   "500.00"      -> 50000  (500)
 *   "90.00"       -> 9000   (90)
 *   "₹10,000"     -> 1000000 (10000)
 *   "₹10,000.50"  -> 1000050 (10000.50)
 */
describe("parseMoneyToken normalization", () => {
  it("50.00 -> 50", () => {
    expect(parseMoneyToken("50.00")?.amountMinor).toBe(5000);
  });

  it("500.00 -> 500", () => {
    expect(parseMoneyToken("500.00")?.amountMinor).toBe(50000);
  });

  it("90.00 -> 90", () => {
    expect(parseMoneyToken("90.00")?.amountMinor).toBe(9000);
  });

  it("₹10,000 -> 10000", () => {
    const parsed = parseMoneyToken("₹10,000");
    expect(parsed?.amountMinor).toBe(1000000);
    expect(parsed?.currency).toBe("INR");
  });

  it("₹10,000.50 -> 10000.50", () => {
    expect(parseMoneyToken("₹10,000.50")?.amountMinor).toBe(1000050);
  });

  it("handles bare integers without a decimal", () => {
    expect(parseMoneyToken("540")?.amountMinor).toBe(54000);
  });
});
