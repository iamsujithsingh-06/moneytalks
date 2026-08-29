import { beforeEach, describe, expect, it } from "vitest";
import { clearAll, offlineStore } from "@moneytalks/offline";
import { clearDrafts, listDrafts } from "./ocr-store.js";
import { confirmDraft, ingestReceipt } from "./ocr-ingest.js";

const RECEIPT = [
  "Cafe Zeta",
  "Subtotal  500.00",
  "GST  90.00",
  "TOTAL  ₹540.00",
  "Date: 14/08/2026",
].join("\n");

describe("receipt OCR ingestion", () => {
  beforeEach(async () => {
    await clearDrafts();
    await clearAll();
  });

  it("captures a parsed receipt as a pending review draft", async () => {
    const result = await ingestReceipt({
      text: RECEIPT,
      mimeType: "text/plain",
      name: "pasted",
      size: RECEIPT.length,
    });

    expect(result.captured).toBe(true);
    expect(result.record.status).toBe("pending");
    expect(result.record.draft?.amountMinor.value).toBe(54000);
    expect(result.record.draft?.merchant.value).toBe("Cafe Zeta");
    expect(result.record.draft?.transactionDate.value).toBe("2026-08-14");

    const pending = await listDrafts("pending");
    expect(pending).toHaveLength(1);
  });

  it("does not capture an empty paste", async () => {
    const result = await ingestReceipt({
      text: "   ",
      mimeType: "text/plain",
      name: "pasted",
      size: 3,
    });
    expect(result.captured).toBe(false);
    expect(result.record.status).toBe("ignored");
  });

  it("flags a duplicate against an existing offline ledger transaction", async () => {
    await offlineStore.create("transactions", {
      type: "expense",
      amountMinor: 54000,
      currency: "INR",
      transactionDate: "2026-08-14",
      merchant: "Cafe Zeta",
      source: "ocr",
    });

    const result = await ingestReceipt({
      text: RECEIPT,
      mimeType: "text/plain",
      name: "pasted",
      size: RECEIPT.length,
    });

    expect(result.captured).toBe(false);
    expect(result.record.status).toBe("duplicate");
    expect(result.record.dedupSignals).toContain("content");
  });

  it("re-ingesting the same receipt does not double-capture", async () => {
    await ingestReceipt({ text: RECEIPT, mimeType: "text/plain", name: "p", size: RECEIPT.length });
    const second = await ingestReceipt({ text: RECEIPT, mimeType: "text/plain", name: "p", size: RECEIPT.length });
    expect(second.captured).toBe(false);
    expect((await listDrafts("pending")).length).toBe(1);
  });

  it("confirm writes an offline transaction and marks the draft confirmed", async () => {
    const captured = await ingestReceipt({ text: RECEIPT, mimeType: "text/plain", name: "p", size: RECEIPT.length });
    if (!captured.record.draft) throw new Error("expected draft");

    const { clientId } = (await confirmDraft(captured.record)) ?? {};
    expect(clientId).toBeTruthy();

    const tx = await offlineStore.get("transactions", clientId as string);
    expect(tx).toBeTruthy();
    expect(tx?.amountMinor).toBe(54000);
    expect(tx?.source).toBe("ocr");

    const drafts = await listDrafts();
    expect(drafts[0]?.status).toBe("confirmed");
  });

  it("confirm applies user edits before writing the offline transaction", async () => {
    const captured = await ingestReceipt({ text: RECEIPT, mimeType: "text/plain", name: "p", size: RECEIPT.length });
    if (!captured.record.draft) throw new Error("expected draft");

    const { clientId } =
      (await confirmDraft(captured.record, {
        amountMinor: 99900,
        merchant: "EDITED MERCHANT",
      })) ?? {};
    expect(clientId).toBeTruthy();

    const tx = (await offlineStore.get(
      "transactions",
      clientId as string,
    )) as unknown as { amountMinor: number; merchant: string | null };
    expect(tx.amountMinor).toBe(99900);
    expect(tx.merchant).toBe("EDITED MERCHANT");
  });
});
