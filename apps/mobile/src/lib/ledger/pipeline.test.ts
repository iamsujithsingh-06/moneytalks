import { beforeEach, describe, expect, it } from "vitest";
import { clearAll } from "@moneytalks/offline";
import { clearDrafts } from "../sms/sms-store.js";
import { confirmDraft, ingestSms } from "../sms/ingest.js";
import { createManualTransaction } from "./manual.js";
import { computeDashboardFromLedger, loadLedger } from "./dashboard.js";

const UPI_DEBIT =
  "Rs.1,234.50 debited from A/c **5687 on 25-08-26 at SWIGGY. UPI Ref: 417281920347. Avl Bal Rs.50,000.00";

function sms(body: string, sender: string | null = "VM-HDFCBK") {
  return { sender, body, receivedAt: "2026-08-25T09:30:00.000Z" };
}

describe("end-to-end: SMS + manual into the same ledger dashboard", () => {
  beforeEach(async () => {
    await clearDrafts();
    await clearAll();
  });

  it("shows both an automatic (SMS) capture and a manual entry in the dashboard ledger", async () => {
    // Automatic capture: parse + confirm an SMS into the offline transactions ledger.
    const captured = await ingestSms(sms(UPI_DEBIT));
    expect(captured.captured).toBe(true);
    if (!captured.record.draft) throw new Error("expected draft");
    await confirmDraft(captured.record);

    // Manual (cash/bill) entry into the same ledger.
    await createManualTransaction({
      kind: "expense",
      amountMinor: 25000,
      merchant: "Grocery store",
      note: "Weekly groceries in cash",
      transactionDate: "2026-08-26",
    });

    const ledger = await loadLedger();
    // Pin the dashboard window to the SMS's month so both lines land in it.
    const data = await computeDashboardFromLedger({
      now: new Date("2026-08-25T12:00:00.000Z"),
    });

    expect(ledger).toHaveLength(2);

    const smsTxn = ledger.find((t) => t.source === "sms");
    const manualTxn = ledger.find((t) => t.source === "manual");

    expect(smsTxn).toBeTruthy();
    expect(smsTxn?.autoDetected).toBe(true);
    expect(smsTxn?.merchant).toContain("SWIGGY");
    expect(smsTxn?.amountMinor).toBe(123450);

    expect(manualTxn).toBeTruthy();
    expect(manualTxn?.autoDetected).toBe(false);
    expect(manualTxn?.amountMinor).toBe(25000);

    // Both flow into the dashboard aggregation.
    expect(data.monthExpense).toBe(123450 + 25000);
    expect(data.recent.map((t) => t.clientId).sort()).toEqual(
      ledger.map((t) => t.clientId).sort(),
    );
  });

  it("does not double-count when the same SMS is ingested twice (idempotent)", async () => {
    const first = await ingestSms(sms(UPI_DEBIT));
    const second = await ingestSms(sms(UPI_DEBIT));
    expect(first.captured).toBe(true);
    expect(second.captured).toBe(false);

    await confirmDraft(first.record);
    const ledger = await loadLedger();
    expect(ledger.filter((t) => t.source === "sms")).toHaveLength(1);
  });
});
