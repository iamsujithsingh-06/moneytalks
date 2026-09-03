import { describe, expect, it } from "vitest";
import { computeAnalysis } from "./analysis.js";
import type { TransactionPublic } from "@moneytalks/types";

const NOW = new Date("2026-08-15T12:00:00.000Z");

function tx(
  partial: Partial<TransactionPublic> & {
    amountMinor: number;
    type: string;
    transactionDate: string;
  },
): TransactionPublic {
  return {
    id: partial.id ?? "id",
    userId: "u",
    clientId: partial.clientId ?? `client-${Math.random()}`,
    type: partial.type,
    direction: (partial.direction as string) ?? null,
    source: partial.source ?? "manual",
    status: "confirmed",
    amountMinor: partial.amountMinor,
    currency: partial.currency ?? "INR",
    transactionDate: partial.transactionDate,
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
    createdAt: partial.createdAt ?? `${partial.transactionDate}T00:00:00.000Z`,
    updatedAt: partial.createdAt ?? `${partial.transactionDate}T00:00:00.000Z`,
    rev: 1,
  };
}

describe("computeAnalysis", () => {
  describe("monthly period", () => {
    it("computes income, expense, net savings within the calendar month", () => {
      const data = computeAnalysis(
        [
          tx({ type: "income", amountMinor: 500000, direction: "inflow", transactionDate: "2026-08-10" }),
          tx({ type: "expense", amountMinor: 123450, direction: "outflow", transactionDate: "2026-08-05", merchant: "SWIGGY" }),
          tx({ type: "expense", amountMinor: 89900, direction: "outflow", transactionDate: "2026-08-15", merchant: "BigBasket" }),
          tx({ type: "expense", amountMinor: 25000, direction: "outflow", transactionDate: "2026-07-20", merchant: "July" }),
        ],
        "monthly",
        NOW,
      );

      expect(data.income).toBe(500000);
      expect(data.expense).toBe(123450 + 89900);
      expect(data.netSavings).toBe(500000 - (123450 + 89900));
      expect(data.prev.expense).toBe(25000);
    });

    it("builds a daily trend across every day of the month", () => {
      const data = computeAnalysis(
        [
          tx({ type: "expense", amountMinor: 1000, transactionDate: "2026-08-01", merchant: "A" }),
          tx({ type: "expense", amountMinor: 3000, transactionDate: "2026-08-15", merchant: "B" }),
        ],
        "monthly",
        NOW,
      );
      expect(data.trend).toHaveLength(31);
      expect(data.trend[0]!.key).toBe("2026-08-01");
      expect(data.trend[14]!.expense).toBe(3000);
      expect(data.trend.find((t) => t.key === "2026-08-15")?.expense).toBe(3000);
    });

    it("identifies the highest spending day", () => {
      const data = computeAnalysis(
        [
          tx({ type: "expense", amountMinor: 1000, transactionDate: "2026-08-01", merchant: "A" }),
          tx({ type: "expense", amountMinor: 4000, transactionDate: "2026-08-15", merchant: "B" }),
          tx({ type: "expense", amountMinor: 2000, transactionDate: "2026-08-10", merchant: "C" }),
        ],
        "monthly",
        NOW,
      );
      expect(data.highestDay?.key).toBe("2026-08-15");
      expect(data.highestDay?.expense).toBe(4000);
    });

    it("ranks categories (merchants) expense-only and returns top 3", () => {
      const data = computeAnalysis(
        [
          tx({ type: "expense", amountMinor: 1000, transactionDate: "2026-08-01", merchant: "A" }),
          tx({ type: "expense", amountMinor: 500, transactionDate: "2026-08-02", merchant: "A" }),
          tx({ type: "expense", amountMinor: 3000, transactionDate: "2026-08-03", merchant: "B" }),
          tx({ type: "expense", amountMinor: 2000, transactionDate: "2026-08-04", merchant: "C" }),
          tx({ type: "income", amountMinor: 9000, transactionDate: "2026-08-05", merchant: "Salary" }),
        ],
        "monthly",
        NOW,
      );
      expect(data.categories.map((c) => c.name)).toEqual(["B", "C", "A"]);
      expect(data.categories[2]).toMatchObject({ name: "A", totalMinor: 1500, count: 2 });
      expect(data.topCategories).toHaveLength(3);
      // income never counts toward category spend
      expect(data.categories.some((c) => c.name === "Salary")).toBe(false);
    });

    it("uses UTC Monday-start for the weekly period", () => {
      // 2026-08-15 is a Saturday; its ISO week starts Mon 2026-08-10.
      // Aug 16 (Sunday) is still in this week; Aug 9 (previous Sunday) is NOT.
      const data = computeAnalysis(
        [
          tx({ type: "expense", amountMinor: 1000, transactionDate: "2026-08-09", merchant: "SunPrev" }),
          tx({ type: "expense", amountMinor: 5000, transactionDate: "2026-08-10", merchant: "Mon" }),
          tx({ type: "expense", amountMinor: 7000, transactionDate: "2026-08-16", merchant: "SunThis" }),
        ],
        "weekly",
        NOW,
      );
      expect(data.trend[0]!.key).toBe("2026-08-10");
      expect(data.trend).toHaveLength(7);
      // Mon (5000) + Sun (7000) are both in this week; SunPrev (1000) is excluded
      expect(data.expense).toBe(12000);
    });
  });

  describe("guards and edge cases", () => {
    it("returns zeros and no categories when there is no spending", () => {
      const data = computeAnalysis([], "monthly", NOW);
      expect(data.income).toBe(0);
      expect(data.expense).toBe(0);
      expect(data.netSavings).toBe(0);
      expect(data.categories).toEqual([]);
      expect(data.highestDay).toBeNull();
      expect(data.avgDailySpend).toBe(0);
    });

    it("guards previous-period zero values (no division blow-up) and yields no comparison insights", () => {
      const data = computeAnalysis(
        [tx({ type: "expense", amountMinor: 1200, transactionDate: "2026-08-10", merchant: "X" })],
        "monthly",
        NOW,
      );
      expect(data.prev.income).toBe(0);
      expect(data.prev.expense).toBe(0);
      // delta stays finite
      expect(Number.isFinite(data.delta.expense)).toBe(true);
      // no comparison insights generated for a zero previous period
      expect(data.insights.some((i) => i.kind.includes("spend-up") || i.kind.includes("spend-down") || i.kind.includes("avg-daily"))).toBe(false);
    });

    it("computed average daily spend is deterministic integer minor units", () => {
      const data = computeAnalysis(
        [tx({ type: "expense", amountMinor: 31_000, transactionDate: "2026-08-10", merchant: "X" })],
        "monthly",
        NOW,
      );
      expect(data.avgDailySpend).toBe(Math.round(31_000 / 31));
      expect(Number.isInteger(data.avgDailySpend)).toBe(true);
    });

    it("generates insights from real data", () => {
      const data = computeAnalysis(
        [
          tx({ type: "income", amountMinor: 500000, direction: "inflow", transactionDate: "2026-08-01" }),
          tx({ type: "expense", amountMinor: 200000, transactionDate: "2026-08-05", merchant: "Rent" }),
          tx({ type: "expense", amountMinor: 100000, transactionDate: "2026-08-12", merchant: "Groceries" }),
        ],
        "monthly",
        NOW,
      );
      expect(data.insights.length).toBeGreaterThan(0);
      expect(data.insights.every((i) => i.id && i.title && i.body)).toBe(true);
      expect(["info", "positive", "warning", "negative"]).toContain(data.insights[0]!.tone);
    });
  });
});
