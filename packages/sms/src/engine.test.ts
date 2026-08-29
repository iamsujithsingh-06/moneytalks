import { describe, expect, it } from "vitest";
import {
  parseSms,
  isDuplicate,
  messageHash,
  contentFingerprint,
  parseAmount,
  detectFinancial,
  type SmsTransactionDraft,
} from "./index.js";

const msg = (body: string, sender: string | null = null): { body: string; sender: string | null; receivedAt: string | null } => ({
  body,
  sender,
  receivedAt: "2026-08-28T10:00:00.000Z",
});

/* ------------------------------- hash ------------------------------- */

describe("sha256", () => {
  it("matches the known SHA-256 vector for 'abc'", () => {
    expect(messageHash("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
  it("is deterministic and case/whitespace-insensitive", () => {
    expect(messageHash("  Pay   Rs.500  ")).toBe(messageHash("pay rs.500"));
    expect(messageHash("A")).not.toBe(messageHash("B"));
  });
});

/* ----------------------------- amount ------------------------------- */

describe("parseAmount", () => {
  it("parses ₹ with thousands separators and decimals", () => {
    expect(parseAmount("Rs.1,234.50 debited from A/c")?.amountMinor).toBe(123450);
  });
  it("parses integer INR no decimals", () => {
    expect(parseAmount("INR 500 paid")?.amountMinor).toBe(50000);
  });
  it("parses ₹ symbol", () => {
    expect(parseAmount("₹1,000.00 sent")?.amountMinor).toBe(100000);
  });
  it("prefers the first (transaction) amount over a trailing balance", () => {
    // Transaction amount appears before "Avl Bal" in real bank SMS.
    expect(parseAmount("RS. 500 available balance 12000.00")?.amountMinor).toBe(50000);
  });
  it("prefers a keyword-marked transaction amount over a bare figure", () => {
    // Do NOT blindly trust the first amount: prefer the one tied to the
    // transaction keyword ("debited") over a standalone figure.
    expect(
      parseAmount("₹200.00 this is just some reference text here ₹3,000.00 debited from A/c")?.amountMinor,
    ).toBe(300000);
    expect(
      parseAmount("₹200.00 this is just some reference text here ₹3,000.00 debited from A/c")?.ambiguous,
    ).toBe(false);
  });
  it("skips a clearly-labelled available-balance amount", () => {
    expect(
      parseAmount("₹1,000.00 debited at SWIGGY. Avl Bal ₹80,000.00")?.amountMinor,
    ).toBe(100000);
  });
  it("flags multiple genuinely ambiguous amounts for review", () => {
    // Two non-balance, non-keyword amounts => refusal to guess => ambiguous.
    const r = parseAmount("there are ₹100.00 and ₹200.00 amounts here");
    expect(r?.ambiguous).toBe(true);
  });
  it("returns null when no amount present", () => {
    expect(parseAmount("Your transaction is complete")).toBeNull();
  });
});

/* --------------------------- detection ------------------------------ */

describe("detectFinancial", () => {
  it("flags a debit SMS as financial", () => {
    expect(detectFinancial(msg("Rs.500 debited from A/c", "SBIINB"))).toMatchObject({
      isFinancial: true,
      bankSource: "sbi",
    });
  });
  it("flags a credit SMS as financial", () => {
    expect(detectFinancial(msg("credited with Rs 1,000", "HDFCBK"))).toMatchObject({
      isFinancial: true,
      bankSource: "hdfc",
    });
  });
  it("ignores OTP even from a known bank", () => {
    expect(detectFinancial(msg("Your OTP for login is 123456", "SBIINB")).isFinancial).toBe(false);
  });
  it("ignores a promo message without amount", () => {
    expect(detectFinancial(msg("Get 50% off this weekend on apparel!", "BRAND")).isFinancial).toBe(false);
  });
});

/* ------------------------------ engine ------------------------------ */

describe("parseSms — debit transaction", () => {
  it("parses a generic UPI debit and extracts merchant + account", () => {
    const r = parseSms(
      msg("Rs.1,234.50 debited from A/c **5687 on 25-05-26 at SWIGGY. UPI Ref: 417281920347. Avl Bal Rs.50,000.00"),
    );
    expect(r.disposition).toBe("transaction");
    expect(r.draft?.type).toBe("expense");
    expect(r.draft?.amountMinor).toBe(123450);
    expect(r.draft?.merchant?.toUpperCase()).toContain("SWIGGY");
    expect(r.draft?.accountRef).toContain("5687");
    expect(r.draft?.upiRef).toContain("417281920347");
    expect(r.draft?.confidence).toBeGreaterThanOrEqual(0.75);
  });
});

describe("parseSms — credit transaction", () => {
  it("parses a salary credit and classifies as income", () => {
    const r = parseSms(
      msg("Rs.55,000.00 credited to A/c **1234 on 01-09-26 from ACME CORP. Ref 8839234912"),
    );
    expect(r.disposition).toBe("transaction");
    expect(r.draft?.type).toBe("income");
    expect(r.draft?.amountMinor).toBe(5500000);
    expect(r.draft?.counterparty?.toUpperCase()).toContain("ACME");
    expect(r.draft?.transactionDate).toBe("2026-09-01");
  });
});

describe("parseSms — refund", () => {
  it("classifies a refund as type refund", () => {
    const r = parseSms(
      msg("Rs.12,500.00 refunded to your account on 02-09-26. Ref: 773210012345"),
    );
    expect(r.disposition).toBe("transaction");
    expect(r.draft?.type).toBe("refund");
  });
});

describe("parseSms — SBI / HDFC / ICICI refinements", () => {
  it("identifies an SBI ATM withdrawal with merchant", () => {
    const r = parseSms(
      msg("Rs.2,000.00 withdrawn from ATM at SWIGGY on 25-05-26. Avl Bal Rs.1,00,000.00", "SBIINB"),
    );
    expect(r.disposition).toBe("transaction");
    expect(r.draft?.merchant?.toUpperCase()).toContain("SWIGGY");
    expect(r.draft?.bankSource).toBe("sbi");
  });
  it("handles HDFC debit to merchant", () => {
    const r = parseSms(
      msg("Rs.3,456.00 debited to MCDONALDS on 28-08-26. Avl Bal Rs.12,000.00.", "VM-HDFCBK"),
    );
    expect(r.disposition).toBe("transaction");
    expect(r.draft?.merchant?.toUpperCase()).toContain("MCDONALDS");
  });
  it("handles PhonePe UPI payment", () => {
    const r = parseSms(
      msg("₹899.00 Paid to BigBasket using UPI. UPI Ref: 123456789012", "PhonePe"),
    );
    // No embedded date => trustworthy amount+merchant but low date confidence,
    // so it routes to review (ambiguous) rather than auto-approve.
    expect(r.draft?.paymentMethodKind).toBe("upi");
    expect(r.draft?.merchant?.toUpperCase()).toContain("BIGBASKET");
    expect(r.draft?.amountMinor).toBe(89900);
  });
  it("extracts a credit-card payment method", () => {
    const r = parseSms(
      msg("Your card xxxx 4421 was used for INR 1,500.00 at AMAZON.IN on 28-Aug-26", "ICICIBANK"),
    );
    expect(r.draft?.paymentMethodKind).toBe("card");
    expect(r.draft?.merchant?.toUpperCase()).toContain("AMAZON");
  });
});

describe("parseSms — non-transaction / unsupported", () => {
  it("returns non-transaction for an OTP", () => {
    expect(parseSms(msg("Your OTP is 123456", "SBIINB")).disposition).toBe("non-transaction");
  });
  it("returns unsupported for financial text that cannot be parsed", () => {
    const r = parseSms(msg("We are processing your request dear customer", "HDFCBK"));
    expect(["unsupported", "non-transaction"]).toContain(r.disposition);
  });
  it("never produces a draft when it cannot parse confidently", () => {
    const r = parseSms(msg("Dear customer, thank you for banking with us", "HDFCBK"));
    expect(r.draft).toBeUndefined();
  });
});

describe("parseSms — ambiguous (review strongly required)", () => {
  it("flags a parsed-but-low-confidence message as ambiguous", () => {
    // amount + direction but no merchant/date/account => low confidence
    const r = parseSms(msg("Rs.500 debited from your account.", "HDFCBK"));
    expect(r.disposition).toBe("ambiguous");
    expect(r.draft?.amountMinor).toBe(50000);
  });
  it("marks a low-confidence draft for review but still extracts amount", () => {
    const r = parseSms(msg("INR 250 spent on something.", "VM-ICICIBANK"));
    expect(r.draft?.confidence).toBeLessThan(0.75);
    expect(["ambiguous", "transaction"]).toContain(r.disposition);
  });
});

/* ------------------------------ dedup ------------------------------- */

function cand(draft: SmsTransactionDraft): Parameters<typeof isDuplicate>[1][number] {
  return {
    transactionDate: draft.transactionDate,
    amountMinor: draft.amountMinor,
    currency: draft.currency,
    merchant: draft.merchant,
    accountRef: draft.accountRef,
    messageHash: draft.messageHash,
    upiRef: draft.upiRef,
    bankSource: draft.bankSource,
  };
}

describe("isDuplicate", () => {
  const draft = (over: Partial<SmsTransactionDraft> = {}): SmsTransactionDraft => {
    const base = parseSms(
      msg("Rs.1,234.50 debited from A/c **5687 on 25-05-26 at SWIGGY. UPI Ref: 417281920347"),
    );
    return { ...base.draft!, ...over };
  };

  it("detects an exact duplicate by message hash", () => {
    const d = draft();
    expect(isDuplicate(d, [cand(d)]).isDuplicate).toBe(true);
  });

  it("detects a duplicate by UPI ref even with different text", () => {
    const d = draft();
    const other: Parameters<typeof isDuplicate>[1][number] = {
      transactionDate: d.transactionDate,
      amountMinor: d.amountMinor,
      currency: d.currency,
      upiRef: d.upiRef,
      messageHash: "different-hash",
    };
    expect(isDuplicate(d, [other]).signals).toContain("upiRef");
  });

  it("detects a same-day, same-amount, same-merchant fingerprint duplicate", () => {
    const d = draft();
    const other = { ...cand(d), messageHash: "x", upiRef: null };
    expect(isDuplicate(d, [other]).signals).toContain("fingerprint");
  });

  it("does not flag a different amount as duplicate", () => {
    const d = draft();
    const other = { ...cand(d), amountMinor: 999, messageHash: "x", upiRef: null };
    expect(isDuplicate(d, [other]).isDuplicate).toBe(false);
  });

  it("does not flag a far-apart date as duplicate", () => {
    const d = draft();
    const other = {
      ...cand(d),
      transactionDate: "2020-01-01",
      messageHash: "x",
      upiRef: null,
    };
    expect(isDuplicate(d, [other]).isDuplicate).toBe(false);
  });

  it("handles an empty history without error", () => {
    expect(isDuplicate(draft(), []).isDuplicate).toBe(false);
  });

  it("repeated parsing of the same message keeps a stable fingerprint", () => {
    const a = parseSms(msg("Rs.500 debited at TEA SHOP on 24-05-26"));
    const b = parseSms(msg("Rs.500 debited at TEA SHOP on 24-05-26"));
    expect(contentFingerprint(a.draft!)).toBe(contentFingerprint(b.draft!));
    expect(isDuplicate(a.draft!, [cand(b.draft!)]).isDuplicate).toBe(true);
  });
});
