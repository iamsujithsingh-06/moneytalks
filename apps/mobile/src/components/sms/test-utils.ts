import type { SmsDraftRecord } from "../../lib/sms/sms-store.js";

/** Build a realistic pending SMS draft for component tests. */
export function draftRecord(overrides: Partial<SmsDraftRecord> = {}): SmsDraftRecord {
  const base: SmsDraftRecord = {
    id: "draft-1",
    sender: "VM-HDFCBK",
    body: "Rs.1234.50 debited from A/c **5687 on 25-05-26 at SWIGGY. UPI Ref: 417281920347",
    receivedAt: "2026-05-25T09:30:00.000Z",
    messageHash: "hash-1",
    discipline: "transaction",
    reason: "Parsed via hdfc rule-set; high confidence.",
    bankSource: "hdfc",
    draft: {
      amountMinor: 123450,
      currency: "INR",
      type: "expense",
      merchant: "SWIGGY",
      counterparty: null,
      transactionDate: "2026-05-25T09:30:00.000Z",
      accountRef: "**5687",
      upiRef: "417281920347",
      bankRef: null,
      paymentMethodKind: "upi",
      bankSource: "hdfc",
      messageHash: "hash-1",
      confidence: 0.95,
      provider: "hdfc",
    },
    status: "pending",
    dedupSignals: [],
    createdAt: "2026-05-25T09:30:00.000Z",
    updatedAt: "2026-05-25T09:30:00.000Z",
  };
  return { ...base, ...overrides };
}
