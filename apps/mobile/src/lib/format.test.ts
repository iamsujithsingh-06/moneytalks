import { describe, expect, it } from "vitest";
import {
  formatFullDateTime,
  formatPartyName,
  formatSourceLabel,
  formatTransactionLine,
  isAutoTransaction,
} from "./format.js";

describe("formatPartyName", () => {
  it("expense uses merchant; income uses counterparty", () => {
    expect(formatPartyName({ type: "expense", merchant: "SWIGGY", counterparty: "IGNORED", note: null })).toBe("SWIGGY");
    expect(formatPartyName({ type: "income", merchant: "IGNORED", counterparty: "Logesh Kumar", note: null })).toBe("Logesh Kumar");
  });

  it("refund counts as income (counterparty)", () => {
    expect(formatPartyName({ type: "refund", merchant: "IGNORED", counterparty: "Amazon", note: null })).toBe("Amazon");
  });

  it("falls back to note, then a safe placeholder", () => {
    expect(formatPartyName({ type: "expense", merchant: null, counterparty: null, note: "Groceries" })).toBe("Groceries");
    expect(formatPartyName({ type: "expense", merchant: null, counterparty: null, note: null })).toBe("—");
    expect(formatPartyName({ type: "expense", merchant: "  ", counterparty: null, note: "" })).toBe("—");
  });

  it("never returns undefined/null", () => {
    const out = formatPartyName({ type: null, merchant: null, counterparty: null, note: null });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

describe("formatTransactionLine", () => {
  it("expense with merchant → 'Sent to {merchant}'", () => {
    expect(
      formatTransactionLine({
        type: "expense",
        merchant: "Logesh Kumar",
        counterparty: null,
        note: null,
      }),
    ).toBe("Sent to Logesh Kumar");
  });

  it("income with counterparty → 'Received from {counterparty}'", () => {
    expect(
      formatTransactionLine({
        type: "income",
        merchant: null,
        counterparty: "Logesh Kumar",
        note: null,
      }),
    ).toBe("Received from Logesh Kumar");
  });

  it("income ignores merchant, prefers counterparty", () => {
    expect(
      formatTransactionLine({
        type: "income",
        merchant: "Some Shop",
        counterparty: "Logesh Kumar",
        note: null,
      }),
    ).toBe("Received from Logesh Kumar");
  });

  it("expense without merchant falls back to note, then 'Payment'", () => {
    expect(
      formatTransactionLine({ type: "expense", merchant: null, counterparty: null, note: "Groceries" }),
    ).toBe("Sent to Groceries");
    expect(
      formatTransactionLine({ type: "expense", merchant: null, counterparty: null, note: "" }),
    ).toBe("Payment");
    expect(
      formatTransactionLine({ type: "expense", merchant: null, counterparty: null, note: null }),
    ).toBe("Payment");
  });

  it("income without counterparty falls back to note, then 'Income'", () => {
    expect(
      formatTransactionLine({ type: "income", merchant: null, counterparty: null, note: "Salary" }),
    ).toBe("Received from Salary");
    expect(
      formatTransactionLine({ type: "income", merchant: null, counterparty: null, note: null }),
    ).toBe("Income");
  });

  it("never returns undefined/null/empty and trims whitespace", () => {
    expect(
      formatTransactionLine({
        type: "expense",
        merchant: "  SWIGGY  ",
        counterparty: null,
        note: null,
      }),
    ).toBe("Sent to SWIGGY");
    expect(
      formatTransactionLine({ type: "expense", merchant: " ", counterparty: null, note: "   " }),
    ).toBe("Payment");
  });
});

describe("formatSourceLabel", () => {
  it("sms → 'Auto • UPI' by default and via stored kind/ref", () => {
    expect(formatSourceLabel({ source: "sms" })).toBe("Auto • UPI");
    expect(formatSourceLabel({ source: "sms", paymentMethodKind: "upi" })).toBe("Auto • UPI");
    expect(formatSourceLabel({ source: "sms", upiRef: "417281920347" })).toBe("Auto • UPI");
  });

  it("sms honors a non-UPI stored method", () => {
    expect(formatSourceLabel({ source: "sms", paymentMethodKind: "card" })).toBe("Auto • Card");
    expect(formatSourceLabel({ source: "sms", paymentMethodKind: "wallet" })).toBe("Auto • Wallet");
  });

  it("ocr/receipt → 'Auto • Receipt'", () => {
    expect(formatSourceLabel({ source: "ocr" })).toBe("Auto • Receipt");
  });

  it("manual → 'Manual' (and unknown/null source falls back to Manual)", () => {
    expect(formatSourceLabel({ source: "manual" })).toBe("Manual");
    expect(formatSourceLabel({ source: null })).toBe("Manual");
    expect(formatSourceLabel({ source: undefined })).toBe("Manual");
  });
});

describe("isAutoTransaction", () => {
  it("sms and ocr are auto; manual/unknown are not", () => {
    expect(isAutoTransaction({ source: "sms" })).toBe(true);
    expect(isAutoTransaction({ source: "ocr" })).toBe(true);
    expect(isAutoTransaction({ source: "manual" })).toBe(false);
    expect(isAutoTransaction({ source: null })).toBe(false);
  });
});

describe("formatFullDateTime", () => {
  it("renders exact local date + time in the requested format", () => {
    // device local time — create a Date at a specific local wall clock
    const local = new Date(2026, 8, 3, 9, 7, 0); // 3 Sept 2026 09:07 local
    const iso = local.toISOString();
    const dateKey = "2026-09-03";
    expect(formatFullDateTime(dateKey, iso)).toMatch(/3 Sept 2026/);
    expect(formatFullDateTime(dateKey, iso)).toMatch(/9:07/);
    expect(formatFullDateTime(dateKey, iso)).toMatch(/AM|PM/);
    expect(formatFullDateTime(dateKey, iso)).toContain("•");
  });

  it("uses the calendar date from transactionDate with the time from the timestamp, in local time", () => {
    const iso = new Date(2026, 8, 3, 21, 5, 0).toISOString(); // 21:05 local
    expect(formatFullDateTime("2026-09-03", iso)).toMatch(/2026/);
    expect(formatFullDateTime("2026-09-03", iso)).toMatch(/9:05/);
  });

  it("returns date alone (no '•') when there is no usable timestamp", () => {
    expect(formatFullDateTime("2026-09-03", null)).toBe("3 Sept 2026");
    expect(formatFullDateTime("2026-09-03", "not-a-date")).toBe("3 Sept 2026");
  });

  it("treats a full ISO transactionDate as date-only: the TIME always comes from the timestamp, in local time", () => {
    // Regression: a synced transaction stores transactionDate as a full ISO
    // timestamp at UTC midnight. The formatter used to read its time and render
    // UTC-midnight in IST (5:30 AM). It must instead take the date from
    // transactionDate and the TIME from the event timestamp (updatedAt, 9:07).
    const eventIso = new Date(2026, 8, 3, 9, 7, 0).toISOString(); // 09:07 local
    expect(formatFullDateTime("2026-09-03T00:00:00.000Z", eventIso)).toMatch(/3 Sept 2026/);
    expect(formatFullDateTime("2026-09-03T00:00:00.000Z", eventIso)).toMatch(/9:07/);
    expect(formatFullDateTime("2026-09-03T00:00:00.000Z", eventIso)).not.toMatch(/5:30/);
  });

  it("never returns empty text even with bad inputs", () => {
    const out = formatFullDateTime(null, null);
    expect(out).toBeTruthy();
    expect(typeof out).toBe("string");
  });
});
