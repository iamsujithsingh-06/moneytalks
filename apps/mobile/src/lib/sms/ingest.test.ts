import { beforeEach, describe, expect, it } from "vitest";
import { clearAll, offlineStore } from "@moneytalks/offline";
import { clearDrafts, listDrafts, type SmsDraftRecord } from "./sms-store.js";
import { confirmDraft, ingestSms } from "./ingest.js";

const UPI_DEBIT =
  "Rs.1,234.50 debited from A/c **5687 on 25-05-26 at SWIGGY. UPI Ref: 417281920347. Avl Bal Rs.50,000.00";

function sms(body: string, sender: string | null = "VM-HDFCBK") {
  return { sender, body, receivedAt: "2026-05-25T09:30:00.000Z" };
}

describe("sms ingestion", () => {
  beforeEach(async () => {
    await clearDrafts();
    await clearAll();
  });

  it("captures a UPI debit as a pending review draft", async () => {
    const result = await ingestSms(sms(UPI_DEBIT));
    expect(result.captured).toBe(true);
    expect(result.record.status).toBe("pending");
    expect(result.record.draft?.upiRef).toBe("417281920347");
    expect(result.record.discipline).toBe("transaction");

    const pending = await listDrafts("pending");
    expect(pending).toHaveLength(1);
  });

  it("is idempotent: re-ingesting the same message does not double-capture", async () => {
    await ingestSms(sms(UPI_DEBIT));
    const second = await ingestSms(sms(UPI_DEBIT));
    expect(second.captured).toBe(false);
    expect((await listDrafts("pending")).length).toBe(1);
  });

  it("flags a duplicate against an existing offline ledger transaction by UPI ref", async () => {
    await offlineStore.create("transactions", {
      type: "expense",
      amountMinor: 123450,
      currency: "INR",
      transactionDate: "2026-05-25",
      merchant: "SWIGGY",
      upiRef: "417281920347",
      source: "sms",
    });

    const result = await ingestSms(sms(UPI_DEBIT));
    expect(result.captured).toBe(false);
    expect(result.record.status).toBe("duplicate");
    expect(result.record.dedupSignals).toContain("upiRef");
  });

  it("confirm writes an offline transaction and marks the draft confirmed", async () => {
    const captured = await ingestSms(sms(UPI_DEBIT));
    if (!captured.record.draft) throw new Error("expected draft");

    const { clientId } = (await confirmDraft(captured.record)) ?? {};
    expect(clientId).toBeTruthy();

    const tx = await offlineStore.get("transactions", clientId as string);
    expect(tx).toBeTruthy();
    expect(tx?.amountMinor).toBe(123450);

    const drafts = await listDrafts();
    expect(drafts[0]?.status).toBe("confirmed");
  });

  it("confirm applies user edits before writing the offline transaction", async () => {
    const captured = await ingestSms(sms(UPI_DEBIT));
    if (!captured.record.draft) throw new Error("expected draft");

    const { clientId } =
      (await confirmDraft(captured.record, {
        amountMinor: 99900,
        merchant: "EDITED MERCHANT",
        note: "reimbursed later",
      })) ?? {};
    expect(clientId).toBeTruthy();

    const tx = (await offlineStore.get(
      "transactions",
      clientId as string,
    )) as unknown as { amountMinor: number; merchant: string | null; note?: string; smsRef?: { upiRef?: string } };
    expect(tx.amountMinor).toBe(99900);
    expect(tx.merchant).toBe("EDITED MERCHANT");
    expect(tx.note).toBe("reimbursed later");
    // Unexploited parsed fields are preserved.
    expect(tx.smsRef?.upiRef).toBe("417281920347");
  });

  it("confirm returns null for a non-pending draft", async () => {
    const captured = await ingestSms(sms(UPI_DEBIT));
    const rec = (await listDrafts())[0] as SmsDraftRecord;
    const { updateDraftStatus } = await import("./sms-store.js");
    await updateDraftStatus(rec.id, "rejected");
    expect(await confirmDraft(rec)).toBeNull();
    expect(captured.captured).toBe(true);
  });
});
