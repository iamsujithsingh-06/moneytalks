import { beforeEach, describe, expect, it } from "vitest";
import {
  cleanupDrafts,
  clearDrafts,
  getDraft,
  listDrafts,
  newDraftId,
  putDraft,
  updateDraftStatus,
  type SmsDraftRecord,
} from "./sms-store.js";

function record(overrides: Partial<SmsDraftRecord> = {}): SmsDraftRecord {
  return {
    id: newDraftId(),
    sender: "BANKALERT",
    body: "Rs.500.00 debited from a/c **1234. UPI:123456789012",
    receivedAt: "2025-01-01T10:00:00.000Z",
    messageHash: "abc123",
    discipline: "transaction",
    reason: "matched",
    bankSource: "hdfc",
    draft: {
      amountMinor: 50000,
      currency: "INR",
      type: "expense",
      merchant: "UPI",
      counterparty: null,
      transactionDate: "2025-01-01",
      accountRef: "**1234",
      upiRef: "123456789012",
      bankRef: null,
      paymentMethodKind: "upi",
      bankSource: "hdfc",
      messageHash: "abc123",
      confidence: 0.95,
      provider: "hdfc",
    },
    status: "pending",
    dedupSignals: [],
    createdAt: "2025-01-01T10:00:00.000Z",
    updatedAt: "2025-01-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("sms-store", () => {
  beforeEach(async () => {
    await clearDrafts();
  });

  it("round-trips a draft record", async () => {
    const r = record();
    await putDraft(r);
    const loaded = await getDraft(r.id);
    expect(loaded).toMatchObject({
      id: r.id,
      discipline: "transaction",
      status: "pending",
      dedupSignals: [],
    });
    expect(loaded?.draft?.upiRef).toBe("123456789012");
  });

  it("lists drafts newest-first and filters by status", async () => {
    const older = record({ id: newDraftId(), createdAt: "2025-01-01T00:00:00.000Z" });
    const newer = record({ id: newDraftId(), createdAt: "2025-01-02T00:00:00.000Z" });
    await putDraft(older);
    await putDraft(newer);

    const all = await listDrafts();
    expect(all[0]?.id).toBe(newer.id);

    await updateDraftStatus(newer.id, "confirmed");
    const pending = await listDrafts("pending");
    expect(pending.map((d) => d.id)).toEqual([older.id]);
  });

  it("updates status while preserving stored fields", async () => {
    const r = record();
    await putDraft(r);
    const updated = await updateDraftStatus(r.id, "confirmed", {
      syncedClientId: "client-9",
    });
    expect(updated).toMatchObject({
      status: "confirmed",
      syncedClientId: "client-9",
    });
    const reloaded = await getDraft(r.id);
    expect(reloaded?.messageHash).toBe("abc123");
  });

  it("returns null when updating a missing draft", async () => {
    expect(await updateDraftStatus("nope", "confirmed")).toBeNull();
  });

  it("purges old resolved drafts but keeps pending and recent ones", async () => {
    const longAgo = "2020-01-01T00:00:00.000Z";
    const oldConfirmed = record({
      id: newDraftId(),
      status: "confirmed",
      updatedAt: longAgo,
      createdAt: longAgo,
    });
    await putDraft(oldConfirmed);

    const oldPending = record({ id: newDraftId(), createdAt: longAgo, updatedAt: longAgo });
    await putDraft(oldPending);

    const recentConfirmed = record({
      id: newDraftId(),
      status: "confirmed",
      updatedAt: new Date().toISOString(),
    });
    await putDraft(recentConfirmed);

    const removed = await cleanupDrafts(30);

    expect(removed).toBe(1);
    expect(await getDraft(oldConfirmed.id)).toBeNull();
    expect(await getDraft(oldPending.id)).not.toBeNull();
    expect(await getDraft(recentConfirmed.id)).not.toBeNull();
  });
});
