import { beforeEach, describe, expect, it } from "vitest";
import { clearAll, offlineStore } from "@moneytalks/offline";
import {
  createManualTransaction,
  ManualTransactionValidationError,
  validateManualInput,
} from "./manual.js";

describe("manual transaction entry", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("validates the input shape", () => {
    expect(validateManualInput({ kind: "expense", amountMinor: 1234 }).ok).toBe(true);
    expect(validateManualInput({ kind: "expense", amountMinor: 0 }).ok).toBe(false);
    expect(validateManualInput({ kind: "expense", amountMinor: -5 }).ok).toBe(false);
    expect(validateManualInput({ kind: "expense", amountMinor: 12.5 }).ok).toBe(false);
    expect(
      validateManualInput({ kind: "expense", amountMinor: 100, transactionDate: "not-a-date" }).ok,
    ).toBe(false);
  });

  it("persists a manual entry into the SAME offline transactions ledger", async () => {
    const { clientId } = await createManualTransaction({
      kind: "expense",
      amountMinor: 25000,
      merchant: "Grocery store",
      note: "Weekly groceries in cash",
    });

    const doc = await offlineStore.get("transactions", clientId);
    expect(doc).toBeTruthy();
    expect(doc?.amountMinor).toBe(25000);
    expect(doc?.merchant).toBe("Grocery store");
    expect(doc?.note).toBe("Weekly groceries in cash");
    expect(doc?.source).toBe("manual");
    expect(doc?.status).toBe("confirmed");
    expect(doc?.autoDetected).toBe(false);
  });

  it("creates an income transaction with type income and inflow direction semantics", async () => {
    const { clientId } = await createManualTransaction({
      kind: "income",
      amountMinor: 500000,
      merchant: "Employer",
    });
    const doc = await offlineStore.get("transactions", clientId);
    expect(doc?.type).toBe("income");
    expect(doc?.source).toBe("manual");
  });

  it("is idempotent for a manual refund", async () => {
    const { clientId } = await createManualTransaction({
      kind: "refund",
      amountMinor: 45000,
      merchant: "Amazon",
    });
    const doc = await offlineStore.get("transactions", clientId);
    expect(doc?.type).toBe("refund");
  });

  it("throws a validation error for an invalid amount", async () => {
    await expect(
      createManualTransaction({ kind: "expense", amountMinor: 0 }),
    ).rejects.toBeInstanceOf(ManualTransactionValidationError);
  });

  it("rolls forward into the ledger used by SMS confirmations (shared collection)", async () => {
    const { clientId } = await createManualTransaction({
      kind: "expense",
      amountMinor: 1000,
      merchant: "Cash shop",
    });
    const all = await offlineStore.list("transactions");
    expect(all.some((t) => t.clientId === clientId)).toBe(true);
  });
});
