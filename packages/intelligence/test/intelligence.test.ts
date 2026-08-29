import { describe, expect, it } from "vitest";
import {
  buildInsights,
  buildBudgetIntelligence,
  buildForecast,
  detectRecurringExpenses,
  detectAnomalies,
  explainQuestion,
  detectIntent,
  type IntelligenceContext,
} from "../src/index.js";

type Tx = IntelligenceContext["transactions"][number];

function tx(
  partial: Partial<Tx> &
    Pick<Tx, "amountMinor" | "date" | "month">,
): Tx {
  const type = partial.type ?? "expense";
  return {
    id: partial.id ?? `t-${partial.date}-${partial.amountMinor}`,
    type,
    amountMinor: partial.amountMinor,
    currency: partial.currency ?? "USD",
    date: partial.date,
    merchant: partial.merchant ?? null,
    categoryId: partial.categoryId ?? null,
    month: partial.month,
    isIncome: partial.isIncome ?? type === "income",
    isExpense: partial.isExpense ?? type === "expense",
  };
}

const WINDOW = {
  from: new Date("2026-08-01T00:00:00.000Z"),
  to: new Date("2026-08-31T23:59:59.999Z"),
};

function ctx(overrides: Partial<IntelligenceContext> = {}): IntelligenceContext {
  return {
    transactions: [],
    categories: [],
    budgets: [],
    currency: "USD",
    now: "2026-08-29",
    ...overrides,
  };
}

/* ------------------------------- insights ------------------------------- */

describe("buildInsights", () => {
  it("returns income-vs-expense when there is spend", () => {
    const c = ctx({
      transactions: [
        tx({ amountMinor: 1000, type: "income", date: "2026-08-01", month: "2026-08" }),
        tx({ amountMinor: 400, type: "expense", date: "2026-08-02", month: "2026-08" }),
      ],
    });
    const cards = buildInsights(c);
    expect(cards.find((k) => k.kind === "income-vs-expense")).toBeDefined();
  });

  it("flags unusually high category spend", () => {
    const c = ctx({
      categories: [{ id: "cat1", name: "Groceries", type: "expense" }],
      transactions: [
        tx({ amountMinor: 100, categoryId: "cat1", date: "2026-07-05", month: "2026-07" }),
        tx({ amountMinor: 100, categoryId: "cat1", date: "2026-07-20", month: "2026-07" }),
        tx({ amountMinor: 500, categoryId: "cat1", date: "2026-08-10", month: "2026-08" }),
      ],
    });
    const cards = buildInsights(c);
    expect(cards.find((k) => k.kind === "high-category-spend")).toBeDefined();
  });
});

/* --------------------------- budget intelligence ------------------------ */

describe("buildBudgetIntelligence", () => {
  it("computes over/remaining and on-track projection", () => {
    const c = ctx({
      budgets: [
        {
          id: "b1",
          categoryId: "cat1",
          categoryName: "Groceries",
          scope: "category",
          period: "monthly",
          periodAnchor: null,
          allocatedMinor: 1000,
          currency: "USD",
          window: WINDOW,
        },
      ],
      transactions: [
        tx({ amountMinor: 800, categoryId: "cat1", date: "2026-08-05", month: "2026-08" }),
      ],
    });
    const budgets = buildBudgetIntelligence(c);
    expect(budgets).toHaveLength(1);
    expect(budgets[0]!.spentMinor).toBe(800);
    expect(budgets[0]!.remainingMinor).toBe(200);
    expect(budgets[0]!.alertStatus).toBe("warning");
    expect(budgets[0]!.projectedSpentMinor).toBeGreaterThan(800);
  });

  it("marks over-budget when spent exceeds allocation", () => {
    const c = ctx({
      budgets: [
        {
          id: "b1",
          categoryId: "cat1",
          categoryName: "Groceries",
          scope: "category",
          period: "monthly",
          periodAnchor: null,
          allocatedMinor: 500,
          currency: "USD",
          window: WINDOW,
        },
      ],
      transactions: [
        tx({ amountMinor: 600, categoryId: "cat1", date: "2026-08-05", month: "2026-08" }),
      ],
    });
    const budgets = buildBudgetIntelligence(c);
    expect(budgets[0]!.alertStatus).toBe("over");
    expect(budgets[0]!.overspentMinor).toBe(100);
  });
});

/* --------------------------- forecast ----------------------------------- */

describe("buildForecast", () => {
  it("returns insufficient data with no points when no history", () => {
    const f = buildForecast(ctx());
    expect(f.insufficientData).toBe(true);
    expect(f.points).toHaveLength(0);
    expect(f.confidence).toBe("none");
  });

  it("projects from real monthly averages and labels as estimate", () => {
    const c = ctx({
      transactions: [
        tx({ amountMinor: 300, date: "2026-01-05", month: "2026-01" }),
        tx({ amountMinor: 300, date: "2026-02-05", month: "2026-02" }),
        tx({ amountMinor: 300, date: "2026-03-05", month: "2026-03" }),
      ],
    });
    const f = buildForecast(c);
    expect(f.isEstimate).toBe(true);
    expect(f.confidence).toBe("high");
    expect(f.insufficientData).toBe(false);
    expect(f.points.length).toBeGreaterThan(0);
    expect(f.points[0]!.period).toBe("2026-04");
    expect(f.points[0]!.projectedExpenseMinor).toBe(300);
  });
});

/* --------------------------- recurring ---------------------------------- */

describe("detectRecurringExpenses", () => {
  it("detects a regular monthly merchant with evidence", () => {
    const c = ctx({
      transactions: [
        tx({ amountMinor: 1200, merchant: "Netflix", date: "2026-06-01", month: "2026-06" }),
        tx({ amountMinor: 1200, merchant: "Netflix", date: "2026-07-01", month: "2026-07" }),
        tx({ amountMinor: 1200, merchant: "Netflix", date: "2026-08-01", month: "2026-08" }),
      ],
    });
    const rec = detectRecurringExpenses(c);
    expect(rec.some((r) => r.merchant === "Netflix")).toBe(true);
    const nf = rec.find((r) => r.merchant === "Netflix")!;
    expect(nf.frequency).toBe("monthly");
    expect(nf.occurrences).toBe(3);
    expect(nf.typicalAmountMinor).toBe(1200);
    expect(nf.evidence.length).toBe(3);
  });

  it("does not flag a single purchase as recurring", () => {
    const c = ctx({
      transactions: [
        tx({ amountMinor: 500, merchant: "OneOff", date: "2026-08-10", month: "2026-08" }),
      ],
    });
    expect(detectRecurringExpenses(c)).toHaveLength(0);
  });
});

/* --------------------------- anomalies ---------------------------------- */

describe("detectAnomalies", () => {
  it("flags a single expense that dominates total spend", () => {
    const c = ctx({
      transactions: [
        tx({ amountMinor: 1000, date: "2026-08-01", month: "2026-08" }),
        tx({ amountMinor: 200, date: "2026-08-02", month: "2026-08" }),
        tx({ amountMinor: 200, date: "2026-08-03", month: "2026-08" }),
      ],
    });
    const anomalies = detectAnomalies(c);
    expect(anomalies.length).toBeGreaterThan(0);
    expect(anomalies[0]!.reason).toBeTruthy();
    expect(anomalies[0]!.signal).toBeTruthy();
  });

  it("produces no anomalies for a flat, ordinary history", () => {
    const c = ctx({
      transactions: Array.from({ length: 10 }, (_, i) =>
        tx({
          amountMinor: 20,
          date: `2026-08-${String(i + 1).padStart(2, "0")}`,
          month: "2026-08",
        }),
      ),
    });
    expect(detectAnomalies(c)).toHaveLength(0);
  });
});

/* --------------------------- intents ------------------------------------ */

describe("detectIntent", () => {
  it("routes supported questions to the right intent", () => {
    expect(detectIntent("how much did I spend total?")).toBe("total-spend");
    expect(detectIntent("what are my biggest categories?")).toBe("biggest-categories");
    expect(detectIntent("am I over budget this month?")).toBe("budget-status");
    expect(detectIntent("how does this month compare to last?")).toBe("month-comparison");
  });

  it("returns unsupported for ambiguous questions", () => {
    expect(detectIntent("tell me a joke about money")).toBe("unsupported");
  });

  it("is case-insensitive", () => {
    expect(detectIntent("BUDGET STATUS please")).toBe("budget-status");
  });
});

/* --------------------------- explain ------------------------------------ */

describe("explainQuestion", () => {
  it("answers total spend from real data", () => {
    const c = ctx({
      transactions: [
        tx({ amountMinor: 500, date: "2026-08-01", month: "2026-08" }),
        tx({ amountMinor: 500, date: "2026-08-02", month: "2026-08" }),
      ],
    });
    const turn = explainQuestion(c, "how much did I spend total?");
    expect(turn.supported).toBe(true);
    expect(turn.answer).toContain("1000");
    expect(turn.data.amountMinor).toBe(1000);
  });

  it("does not fabricate when there is no data", () => {
    const turn = explainQuestion(ctx(), "how much did I spend total?");
    expect(turn.supported).toBe(false);
    expect(turn.intent).toBe("total-spend");
  });

  it("refuses politely on unsupported intents", () => {
    const turn = explainQuestion(ctx(), "tell me a joke");
    expect(turn.supported).toBe(false);
    expect(turn.fallbackMessage).toBeTruthy();
  });
});
