import { describe, expect, it } from "vitest";
import { isReceiptDuplicate, receiptContentFingerprint } from "./dedup.js";
import { sha256Hex } from "./sha.js";
import type { OcrDedupeCandidate } from "./types.js";

const base = {
  transactionDate: "2026-08-14T10:00:00.000Z",
  amountMinor: 54000,
  currency: "INR",
  merchant: "Cafe Zeta",
};

function cand(over: Partial<OcrDedupeCandidate> = {}): OcrDedupeCandidate {
  return { transactionDate: base.transactionDate, amountMinor: base.amountMinor, merchant: base.merchant, ...over };
}

describe("isReceiptDuplicate", () => {
  it("matches on identical image hash", () => {
    const hash = sha256Hex("same-receipt-bytes");
    const match = isReceiptDuplicate(
      { ...base, imageHash: hash, reference: null },
      [cand({ imageHash: hash })],
    );
    expect(match.isDuplicate).toBe(true);
    expect(match.signals).toContain("image");
  });

  it("matches on the same reference number", () => {
    const match = isReceiptDuplicate(
      { ...base, reference: "INV-2026-8891" },
      [cand({ reference: "inv 2026 8891" })],
    );
    expect(match.isDuplicate).toBe(true);
    expect(match.signals).toContain("reference");
  });

  it("matches on content fingerprint within the window", () => {
    const match = isReceiptDuplicate(
      { ...base, currency: "INR", reference: null },
      [cand({ transactionDate: "2026-08-14T11:00:00.000Z" })],
    );
    expect(match.isDuplicate).toBe(true);
    expect(match.signals).toContain("content");
  });

  it("does not match when the amount differs", () => {
    const match = isReceiptDuplicate(
      { ...base, reference: null },
      [cand({ amountMinor: 54001 })],
    );
    expect(match.isDuplicate).toBe(false);
  });

  it("does not match outside the fingerprint window", () => {
    const match = isReceiptDuplicate(
      { ...base, reference: null },
      [cand({ transactionDate: "2026-08-20T10:00:00.000Z" })],
    );
    expect(match.isDuplicate).toBe(false);
  });

  it("isolates ambiguous (amount-only) candidates from wrong merchants", () => {
    const match = isReceiptDuplicate(
      { ...base, reference: null },
      [cand({ merchant: "Some Other Shop" })],
    );
    expect(match.isDuplicate).toBe(false);
  });
});

describe("receiptContentFingerprint", () => {
  it("is deterministic", () => {
    expect(receiptContentFingerprint(base)).toBe(receiptContentFingerprint(base));
  });
});
