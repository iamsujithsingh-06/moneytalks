import { describe, expect, it } from "vitest";
import {
  FINGERPRINT_VERSION,
  buildTransactionFingerprint,
} from "@moneytalks/shared";

const base = {
  amountMinor: 45000,
  currency: "INR",
  transactionDate: "2026-01-05",
  merchant: "Swiggy",
  source: "sms",
};

describe("buildTransactionFingerprint", () => {
  it("is deterministic for identical input", () => {
    expect(buildTransactionFingerprint(base)).toBe(
      buildTransactionFingerprint(base),
    );
  });

  it("uses a versioned prefix with a sha256 hex payload", () => {
    const fp = buildTransactionFingerprint(base);
    expect(fp.startsWith(FINGERPRINT_VERSION)).toBe(true);
    expect(fp.length).toBe(FINGERPRINT_VERSION.length + 64);
  });

  it("changes when any key field changes", () => {
    const amount = buildTransactionFingerprint({ ...base, amountMinor: 45100 });
    const merchant = buildTransactionFingerprint({ ...base, merchant: "Zomato" });
    const date = buildTransactionFingerprint({
      ...base,
      transactionDate: "2026-01-06",
    });
    const reference = buildTransactionFingerprint(base);
    expect(amount).not.toBe(reference);
    expect(merchant).not.toBe(reference);
    expect(date).not.toBe(reference);
  });

  it("normalizes merchant casing and whitespace", () => {
    expect(
      buildTransactionFingerprint({ ...base, merchant: "  SWIGGY  " }),
    ).toBe(buildTransactionFingerprint({ ...base, merchant: "swiggy" }));
    expect(
      buildTransactionFingerprint({ ...base, merchant: "Swiggy   Instamart" }),
    ).toBe(buildTransactionFingerprint({ ...base, merchant: "swiggy instamart" }));
  });

  it("normalizes currency case", () => {
    expect(
      buildTransactionFingerprint({ ...base, currency: "inr" }),
    ).toBe(buildTransactionFingerprint({ ...base, currency: "INR" }));
  });

  it("normalizes transactionDate to the business day", () => {
    expect(
      buildTransactionFingerprint({
        ...base,
        transactionDate: "2026-01-05T00:00:00+05:30",
      }),
    ).toBe(buildTransactionFingerprint({ ...base, transactionDate: "2026-01-05" }));
  });

  it("rejects non-positive amountMinor", () => {
    expect(() =>
      buildTransactionFingerprint({ ...base, amountMinor: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      buildTransactionFingerprint({ ...base, amountMinor: -5 }),
    ).toThrow(RangeError);
    expect(() =>
      buildTransactionFingerprint({ ...base, amountMinor: 10.5 }),
    ).toThrow(RangeError);
  });
});
