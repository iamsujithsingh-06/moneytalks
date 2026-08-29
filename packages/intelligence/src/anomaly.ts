import type { SpendingAnomaly } from "@moneytalks/types";
import type { IntelligenceContext, IntelligenceTransaction } from "./types.js";

/** An expense is "unusually large" when it exceeds this multiple of the
 * per-month average of its category (or of overall average when uncategorized). */
const HIGH_MULTIPLE = 2.5;

/**
 * Explainable anomaly detection using simple statistics over real spend.
 *
 * Signals are rule/statistic based and each flagged item carries a
 * human-readable `reason` and a `signal` so the UI never presents a bare
 * judgement. Anomalies are informational — never medical/legal/investment.
 */
export function detectAnomalies(ctx: IntelligenceContext): SpendingAnomaly[] {
  const anomalies: SpendingAnomaly[] = [];
  const expenses = ctx.transactions.filter((t) => t.isExpense);

  const categoryAvg = spendByCategoryPerMonth(expenses);

  for (const t of expenses) {
    const signal = evaluateExpense(t, expenses, categoryAvg);
    if (signal) {
      anomalies.push({
        id: `anomaly:${t.id}`,
        merchant: t.merchant,
        categoryName: t.categoryId
          ? ctx.categories.find((c) => c.id === t.categoryId)?.name ?? "Unknown category"
          : "Uncategorized",
        amountMinor: t.amountMinor,
        transactionDate: t.date,
        severity: signal.severity,
        reason: signal.reason,
        signal: signal.signal,
      });
    }
  }

  return anomalies;
}

function spendByCategoryPerMonth(
  expenses: IntelligenceTransaction[],
): Map<string, number> {
  const byCatMonth = new Map<string, Map<string, number>>();
  for (const t of expenses) {
    const key = t.categoryId ?? "__none__";
    const months = byCatMonth.get(key) ?? new Map<string, number>();
    months.set(t.month, (months.get(t.month) ?? 0) + t.amountMinor);
    byCatMonth.set(key, months);
  }
  const averages = new Map<string, number>();
  for (const [key, months] of byCatMonth) {
    const totals = [...months.values()];
    const avg = totals.reduce((m, v) => m + v, 0) / totals.length;
    averages.set(key, avg);
  }
  return averages;
}

function evaluateExpense(
  t: IntelligenceTransaction,
  expenses: IntelligenceTransaction[],
  categoryAvg: Map<string, number>,
): {
  severity: SpendingAnomaly["severity"];
  reason: string;
  signal: string;
} | null {
  // Overall daily-spend spike: an expense that is a large share of total spend.
  const allExpense = expenses.reduce((m, x) => m + x.amountMinor, 0);
  if (allExpense > 0 && t.amountMinor / allExpense >= 0.5) {
    const share = Math.round((t.amountMinor / allExpense) * 100);
    return {
      severity: "high",
      reason: `This single expense is ${share}% of your total recorded spending — much larger than your usual transactions.`,
      signal: "large-share-of-total-spend",
    };
  }

  // Category spike vs its per-month average.
  const catKey = t.categoryId ?? "__none__";
  const avg = categoryAvg.get(catKey);
  if (avg && avg > 0 && t.amountMinor >= avg * HIGH_MULTIPLE) {
    const multiple = t.amountMinor / avg;
    return {
      severity: "warning",
      reason: `This ${t.categoryId ? "category" : "uncategorized"} expense is about ${multiple.toFixed(1)}x the average monthly spend for that category.`,
      signal: "category-spend-spike",
    };
  }

  // Merchant repeated large amount.
  const merchantTotal = expenses
    .filter((x) => x.merchant && x.merchant === t.merchant)
    .reduce((m, x) => m + x.amountMinor, 0);
  if (t.merchant && merchantTotal > 0 && t.amountMinor / merchantTotal >= 0.8 && t.amountMinor > merchantTotal * 2) {
    return {
      severity: "info",
      reason: `This is the largest amount you've recorded with ${t.merchant}.`,
      signal: "largest-merchant-transaction",
    };
  }

  return null;
}
