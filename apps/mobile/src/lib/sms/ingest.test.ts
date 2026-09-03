import { beforeEach, describe, expect, it } from "vitest";
import { clearAll, offlineStore } from "@moneytalks/offline";
import { clearDrafts, listDrafts, listPendingDrafts, type SmsDraftRecord } from "./sms-store.js";
import { confirmDraft, ingestSms } from "./ingest.js";

const UPI_DEBIT =
  "Rs.1,234.50 debited from A/c **5687 on 25-05-26 at SWIGGY. UPI Ref: 417281920347. Avl Bal Rs.50,000.00";

const SALARY_CREDIT =
  "Rs.55,000.00 credited to A/c **1234 on 01-09-26 from ACME CORP. Ref 8839234912";

// Low confidence (amount + direction only, no date/merchant/account) => review.
const LOW_CONF_DEBIT = "Rs.500 debited from your account.";

// Real Indian Bank SMS formats (single-asterisk A/c, "RRN <number>" ref).
const INDIAN_CREDIT =
  "Your A/c *3953 is credited with Rs.5.00 on 02-09-26 by HARISH RAGAV. RRN 661109446914. Available balance is Rs.89.78 - Indian Bank";
const INDIAN_DEBIT =
  "Sent Rs.5.00 from A/c *3953 on 02-09-26 to HARISH RAGAV.RRN 128925286398.Avl Bal Rs.84.78.Not you?SMS BLOCK to 9289592895-Indian Bank";

function sms(body: string, sender: string | null = "VM-HDFCBK") {
  return { sender, body, receivedAt: "2026-05-25T09:30:00.000Z" };
}

describe("sms ingestion", () => {
  beforeEach(async () => {
    await clearDrafts();
    await clearAll();
  });

  describe("auto ledger commit (high confidence)", () => {
    it("commits a parsed outgoing UPI debit directly as an Auto Expense", async () => {
      const result = await ingestSms(sms(UPI_DEBIT));
      expect(result.captured).toBe(true);
      expect(result.record.status).toBe("confirmed");
      expect(result.record.discipline).toBe("transaction");
      expect(result.record.draft?.type).toBe("expense");

      // No pending review item remains.
      const pending = await listPendingDrafts();
      expect(pending).toHaveLength(0);

      // A confirmed offline transaction exists, marking it Auto Expense via sms.
      const txns = await offlineStore.list("transactions");
      expect(txns).toHaveLength(1);
      expect(txns[0]?.type).toBe("expense");
      expect(txns[0]?.source).toBe("sms");
      expect(txns[0]?.autoDetected).toBe(true);
      expect(txns[0]?.amountMinor).toBe(123450);
      expect(txns[0]?.status).toBe("confirmed");
    });

    it("commits a parsed incoming credit directly as an Auto Income", async () => {
      const result = await ingestSms(sms(SALARY_CREDIT, "HDFCBK"));
      expect(result.captured).toBe(true);
      expect(result.record.status).toBe("confirmed");
      expect(result.record.draft?.type).toBe("income");

      const pending = await listPendingDrafts();
      expect(pending).toHaveLength(0);

      const txns = await offlineStore.list("transactions");
      expect(txns).toHaveLength(1);
      expect(txns[0]?.type).toBe("income");
      expect(txns[0]?.source).toBe("sms");
      expect(txns[0]?.autoDetected).toBe(true);
      expect(txns[0]?.amountMinor).toBe(5500000);
      expect(txns[0]?.status).toBe("confirmed");
    });

    it("does not leave a pending review item for an auto-committed SMS", async () => {
      await ingestSms(sms(UPI_DEBIT));
      expect(await listPendingDrafts()).toHaveLength(0);
    });

    it("commits the Indian Bank outgoing 'Sent Rs.X' SMS as an Auto Expense", async () => {
      const result = await ingestSms(sms(INDIAN_DEBIT, "VM-INDIANBK"));
      expect(result.captured).toBe(true);
      expect(result.record.status).toBe("confirmed");
      expect(result.record.draft?.type).toBe("expense");
      expect(result.record.draft?.amountMinor).toBe(500);
      expect(await listPendingDrafts()).toHaveLength(0);

      const txns = await offlineStore.list("transactions");
      expect(txns).toHaveLength(1);
      expect(txns[0]?.type).toBe("expense");
      expect(txns[0]?.source).toBe("sms");
      expect(txns[0]?.amountMinor).toBe(500);
    });
  });

  describe("review routing (uncertain / low confidence)", () => {
    it("sends a low-confidence / ambiguous SMS to Review as pending", async () => {
      const result = await ingestSms(sms(LOW_CONF_DEBIT));
      expect(result.record.discipline).toBe("ambiguous");
      expect(result.record.status).toBe("pending");
      const pending = await listPendingDrafts();
      expect(pending).toHaveLength(1);
      // Ambiguous items are NOT auto-committed.
      const txns = await offlineStore.list("transactions");
      expect(txns).toHaveLength(0);
    });

    it("requires a manual confirm to move an ambiguous review item to the ledger", async () => {
      const captured = await ingestSms(sms(LOW_CONF_DEBIT));
      const rec = (await listDrafts("pending"))[0] as SmsDraftRecord;
      const { clientId } = (await confirmDraft(rec)) ?? {};
      expect(clientId).toBeTruthy();
      const txns = await offlineStore.list("transactions");
      expect(txns).toHaveLength(1);
      expect(captured.captured).toBe(true);
    });
  });

  describe("deduplication / idempotency", () => {
    it("is idempotent: re-ingesting the same auto-committed SMS does not double-capture", async () => {
      const first = await ingestSms(sms(UPI_DEBIT));
      expect(first.record.status).toBe("confirmed");

      const second = await ingestSms(sms(UPI_DEBIT));
      expect(second.captured).toBe(false);
      expect((await offlineStore.list("transactions")).length).toBe(1);
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
      // Not re-committed, not queued for review.
      expect((await offlineStore.list("transactions")).length).toBe(1);
      expect(await listPendingDrafts()).toHaveLength(0);
    });

    it("does not treat the Indian Bank outgoing debit as a duplicate of an already-committed incoming credit", async () => {
      // Incoming credit is captured first -> committed to the ledger.
      await ingestSms(sms(INDIAN_CREDIT, "VM-INDIANBK"));
      expect((await offlineStore.list("transactions"))[0]?.type).toBe("income");

      // The outgoing debit (different RRN) must auto-commit as Auto Expense,
      // NOT be eaten by the same-day/same-amount fingerprint collision.
      const result = await ingestSms(sms(INDIAN_DEBIT, "VM-INDIANBK"));
      expect(result.captured).toBe(true);
      expect(result.record.status).toBe("confirmed");

      const txns = await offlineStore.list("transactions");
      expect(txns).toHaveLength(2);
      const expense = txns.find((t) => t.type === "expense");
      expect(expense?.amountMinor).toBe(500);
      expect(expense?.source).toBe("sms");
      expect(await listPendingDrafts()).toHaveLength(0);
    });

    it("dedups a re-received Indian Bank SMS by its RRN even when committed", async () => {
      await ingestSms(sms(INDIAN_DEBIT, "VM-INDIANBK"));
      // Re-ingest the same outgoing debit.
      const again = await ingestSms(sms(INDIAN_DEBIT, "VM-INDIANBK"));
      expect(again.captured).toBe(false);
      expect((await offlineStore.list("transactions")).length).toBe(1);
    });
  });

  describe("manual transaction flow remains unchanged", () => {
    it("produces the same transaction payload a manual confirm would (autoDetected, sms source)", async () => {
      await ingestSms(sms(UPI_DEBIT));
      const txns = await offlineStore.list("transactions");
      const tx = txns[0] as unknown as {
        source: string;
        status: string;
        autoDetected: boolean;
        confidence: number;
        smsRef?: { upiRef?: string; messageHash?: string };
      };
      expect(tx.source).toBe("sms");
      expect(tx.status).toBe("confirmed");
      expect(tx.autoDetected).toBe(true);
      expect(tx.confidence).toBeGreaterThanOrEqual(0.75);
      expect(tx.smsRef?.upiRef).toBe("417281920347");
      expect(tx.smsRef?.messageHash).toBeTruthy();
    });

    it("confirm still works for a genuinely pending (ambiguous) draft with edits", async () => {
      await ingestSms(sms(LOW_CONF_DEBIT));
      const rec = (await listDrafts("pending"))[0] as SmsDraftRecord;
      const { clientId } =
        (await confirmDraft(rec, {
          amountMinor: 99900,
          merchant: "EDITED MERCHANT",
          note: "reimbursed later",
        })) ?? {};
      expect(clientId).toBeTruthy();

      const tx = (await offlineStore.get(
        "transactions",
        clientId as string,
      )) as unknown as {
        type: string;
        amountMinor: number;
        merchant: string | null;
        note?: string;
        source: string;
      };
      expect(tx.type).toBe("expense");
      expect(tx.amountMinor).toBe(99900);
      expect(tx.merchant).toBe("EDITED MERCHANT");
      expect(tx.note).toBe("reimbursed later");
      expect(tx.source).toBe("sms");

      const drafts = await listDrafts();
      expect(drafts.find((d) => d.id === rec.id)?.status).toBe("confirmed");
    });

    it("confirm returns null for a draft that is no longer pending", async () => {
      const captured = await ingestSms(sms(LOW_CONF_DEBIT));
      const rec = (await listDrafts())[0] as SmsDraftRecord;
      const { updateDraftStatus } = await import("./sms-store.js");
      await updateDraftStatus(rec.id, "rejected");
      expect(await confirmDraft(rec)).toBeNull();
      expect(captured.captured).toBe(true);
    });
  });
});
