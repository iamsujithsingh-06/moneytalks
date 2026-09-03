import { beforeEach, describe, expect, it } from "vitest";
import { clearAll, offlineStore } from "@moneytalks/offline";
import {
  computeDashboard,
  computeDashboardFromLedger,
} from "./dashboard.js";
import type { TransactionPublic } from "@moneytalks/types";

const NOW = new Date("2026-08-15T12:00:00.000Z");

function tx(partial: Partial<TransactionPublic> & { amountMinor: number; type: string }): TransactionPublic {
  return {
    id: partial.id ?? "id",
    userId: "u",
    clientId: partial.clientId ?? `client-${Math.random()}`,
    type: partial.type,
    direction: partial.direction as string,
    source: partial.source ?? "manual",
    status: "confirmed",
    amountMinor: partial.amountMinor,
    currency: partial.currency ?? "INR",
    transactionDate: partial.transactionDate ?? "2026-08-10",
    merchant: partial.merchant ?? null,
    counterparty: partial.counterparty ?? null,
    note: partial.note ?? null,
    tags: [],
    categoryId: null,
    paymentMethodId: null,
    accountRef: null,
    confidence: null,
    autoDetected: false,
    duplicateOf: null,
    duplicateGroup: null,
    editedCount: 0,
    createdAt: partial.createdAt ?? "2026-08-10T00:00:00.000Z",
    updatedAt: partial.createdAt ?? "2026-08-10T00:00:00.000Z",
    rev: 1,
  };
}

describe("offline dashboard computation", () => {
  describe("computeDashboard (pure)", () => {
    it("computes balance by direction and month income/expense/net", () => {
      const data = computeDashboard(
        [
          tx({ type: "income", amountMinor: 500000, direction: "inflow", transactionDate: "2026-08-10" }),
          tx({ type: "expense", amountMinor: 123450, direction: "outflow", transactionDate: "2026-08-05", merchant: "SWIGGY" }),
          tx({ type: "expense", amountMinor: 89900, direction: "outflow", transactionDate: "2026-08-15", merchant: "BigBasket" }),
          tx({ type: "expense", amountMinor: 25000, direction: "outflow", transactionDate: "2026-07-20" }),
        ],
        { now: NOW },
      );

      expect(data.balance).toBe(500000 - 123450 - 89900 - 25000);
      expect(data.monthIncome).toBe(500000);
      expect(data.monthExpense).toBe(123450 + 89900);
      expect(data.net).toBe(500000 - (123450 + 89900));
    });

    it("falls back to type-derived direction when direction is missing (offline write)", () => {
      const data = computeDashboard(
        [
          tx({ type: "income", amountMinor: 500000, transactionDate: "2026-08-10" }),
          tx({ type: "refund", amountMinor: 45000, transactionDate: "2026-08-12" }),
          tx({ type: "expense", amountMinor: 123450, transactionDate: "2026-08-05" }),
        ],
        { now: NOW },
      );

      expect(data.balance).toBe(500000 + 45000 - 123450);
      expect(data.monthIncome).toBe(500000 + 45000);
      expect(data.monthExpense).toBe(123450);
    });

    it("counts today's activity and outflow only for today's date", () => {
      const data = computeDashboard(
        [
          tx({ type: "expense", amountMinor: 89900, transactionDate: "2026-08-15", merchant: "BigBasket" }),
          tx({ type: "expense", amountMinor: 123450, transactionDate: "2026-08-05", merchant: "SWIGGY" }),
          tx({ type: "income", amountMinor: 20000, transactionDate: "2026-08-15" }),
        ],
        { now: NOW },
      );

      expect(data.todayCount).toBe(2);
      expect(data.todayOutflow).toBe(89900);
    });

    it("ranks top spending by merchant (expense only) this month", () => {
      const data = computeDashboard(
        [
          tx({ type: "expense", amountMinor: 123450, transactionDate: "2026-08-05", merchant: "SWIGGY" }),
          tx({ type: "expense", amountMinor: 89900, transactionDate: "2026-08-15", merchant: "BigBasket" }),
          tx({ type: "expense", amountMinor: 50000, transactionDate: "2026-08-02", merchant: "SWIGGY" }),
        ],
        { now: NOW },
      );

      expect(data.topSpend[0]).toMatchObject({ name: "SWIGGY", totalMinor: 173450, count: 2 });
      expect(data.topSpend[1]).toMatchObject({ name: "BigBasket", totalMinor: 89900, count: 1 });
    });

    it("excludes incoming transactions from top spending (regression)", () => {
      // Incoming funds to Mr R THARUN KUMAR must NOT appear as spending.
      const data = computeDashboard(
        [
          tx({
            type: "income",
            amountMinor: 500,
            direction: "inflow",
            transactionDate: "2026-08-04",
            counterparty: "Mr R THARUN KUMAR",
          }),
          tx({
            type: "expense",
            amountMinor: 500,
            direction: "outflow",
            transactionDate: "2026-08-05",
            merchant: "Mr R THARUN KUMAR",
          }),
        ],
        { now: NOW },
      );

      // Only the outgoing expense contributes to top spending.
      expect(data.topSpend).toHaveLength(1);
      expect(data.topSpend[0]).toMatchObject({
        name: "Mr R THARUN KUMAR",
        totalMinor: 500,
        count: 1,
      });
      expect(data.monthIncome).toBe(500);
      expect(data.monthExpense).toBe(500);
    });

    it("aggregates only expenses across mixed income/expense data (regression)", () => {
      const data = computeDashboard(
        [
          tx({ type: "income", amountMinor: 100000, transactionDate: "2026-08-02", counterparty: "ACME" }),
          tx({ type: "income", amountMinor: 250000, transactionDate: "2026-08-10", counterparty: "ACME" }),
          tx({ type: "expense", amountMinor: 50000, transactionDate: "2026-08-04", merchant: "SWIGGY" }),
          tx({ type: "expense", amountMinor: 75000, transactionDate: "2026-08-12", merchant: "SWIGGY" }),
          tx({ type: "expense", amountMinor: 30000, transactionDate: "2026-08-06", merchant: "BigBasket" }),
        ],
        { now: NOW },
      );

      // A merchant that also received money from us (income) must NOT be
      // counted toward spending.
      expect(data.topSpend.find((s) => s.name === "ACME")).toBeUndefined();
      expect(data.topSpend.find((s) => s.name === "SWIGGY")).toMatchObject({
        name: "SWIGGY",
        totalMinor: 125000,
        count: 2,
      });
      expect(data.topSpend.find((s) => s.name === "BigBasket")).toMatchObject({
        name: "BigBasket",
        totalMinor: 30000,
        count: 1,
      });
    });

    it("adds the initial balance to the all-time balance without touching income/expense", () => {
      const data = computeDashboard(
        [
          tx({ type: "income", amountMinor: 500000, direction: "inflow", transactionDate: "2026-08-10" }),
          tx({ type: "expense", amountMinor: 123450, direction: "outflow", transactionDate: "2026-08-05" }),
          tx({ type: "expense", amountMinor: 89900, direction: "outflow", transactionDate: "2026-08-15" }),
        ],
        { now: NOW, initialBalanceMinor: 200_000 },
      );

      expect(data.balance).toBe(200_000 + 500000 - 123450 - 89900);
      expect(data.monthIncome).toBe(500000);
      expect(data.monthExpense).toBe(123450 + 89900);
      expect(data.net).toBe(500000 - (123450 + 89900));
    });

    it("returns the recent transactions newest-first", () => {
      const data = computeDashboard(
        [
          tx({ type: "expense", amountMinor: 100, transactionDate: "2026-08-01", createdAt: "2026-08-01T00:00:00.000Z" }),
          tx({ type: "expense", amountMinor: 200, transactionDate: "2026-08-05", createdAt: "2026-08-05T00:00:00.000Z" }),
          tx({ type: "expense", amountMinor: 300, transactionDate: "2026-08-03", createdAt: "2026-08-03T00:00:00.000Z" }),
        ],
        { now: NOW, limit: 2 },
      );

      expect(data.recent.map((t) => t.amountMinor)).toEqual([200, 300]);
    });
  });

  describe("computeDashboardFromLedger (indexeddb)", () => {
    beforeEach(async () => {
      await clearAll();
    });

    it("counts only confirmed transactions in the ledger", async () => {
      await offlineStore.create("transactions", {
        type: "income",
        amountMinor: 500000,
        currency: "INR",
        transactionDate: "2026-08-10",
        source: "manual",
        status: "confirmed",
      });
      await offlineStore.create("transactions", {
        type: "expense",
        amountMinor: 123450,
        currency: "INR",
        transactionDate: "2026-08-05",
        merchant: "SWIGGY",
        source: "manual",
        status: "confirmed",
      });
      await offlineStore.create("transactions", {
        type: "expense",
        amountMinor: 99999,
        currency: "INR",
        transactionDate: "2026-08-06",
        merchant: "PENDING",
        source: "manual",
        status: "pending",
      });

      const data = await computeDashboardFromLedger({ now: NOW });
      expect(data.balance).toBe(500000 - 123450);
      expect(data.monthIncome).toBe(500000);
      expect(data.monthExpense).toBe(123450);
      // pending is excluded entirely
      expect(data.recent).toHaveLength(2);
    });

    it("includes the synced initial balance setting in the ledger balance", async () => {
      await offlineStore.create("settings", {
        clientId: "00000000-0000-4000-8000-0000000000ab",
        initialBalanceMinor: 250_000,
      });
      await offlineStore.create("transactions", {
        type: "expense",
        amountMinor: 40000,
        currency: "INR",
        transactionDate: "2026-08-06",
        merchant: "ZOMATO",
        source: "manual",
        status: "confirmed",
      });

      const data = await computeDashboardFromLedger({ now: NOW });
      expect(data.balance).toBe(250_000 - 40000);
      expect(data.monthExpense).toBe(40000);
    });
  });
});
