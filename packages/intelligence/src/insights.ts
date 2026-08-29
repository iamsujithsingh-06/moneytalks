import type { InsightCard } from "@moneytalks/types";
import { monthDiff, monthKeyFromIso } from "./dates.js";
import type { IntelligenceContext, IntelligenceTransaction } from "./types.js";

/** Threshold multiple of a category's typical monthly spend used to flag an
 * unusually high month (2 means 2x the per-month average). */
const HIGH_CATEGORY_MULTIPLIER = 2;

/** Minimum number of expense transactions to consider a trend meaningful. */
const MIN_TREND_POINTS = 2;

interface CategorySpend {
  totalMinor: number;
  count: number;
}

function categorySpend(expenses: IntelligenceTransaction[]): Map<string, CategorySpend> {
  const map = new Map<string, CategorySpend>();
  for (const t of expenses) {
    const row = map.get(t.categoryId ?? "__none__") ?? { totalMinor: 0, count: 0 };
    row.totalMinor += t.amountMinor;
    row.count += 1;
    map.set(t.categoryId ?? "__none__", row);
  }
  return map;
}

/** Deterministic spending insights over real, user-isolated transactions. */
export function buildInsights(ctx: IntelligenceContext): InsightCard[] {
  const insights: InsightCard[] = [];

  const expenses = ctx.transactions.filter((t) => t.isExpense);
  const incomes = ctx.transactions.filter((t) => t.isIncome);

  const expenseTotal = expenses.reduce((m, t) => m + t.amountMinor, 0);
  const incomeTotal = incomes.reduce((m, t) => m + t.amountMinor, 0);

  // ---- Income vs expenses -------------------------------------------------
  if (incomeTotal > 0 || expenseTotal > 0) {
    const balance = incomeTotal - expenseTotal;
    const tone = balance >= 0 ? "positive" : "negative";
    insights.push({
      id: "income-vs-expense",
      kind: "income-vs-expense",
      tone,
      title:
        balance >= 0
          ? "You're spending less than you earn"
          : "Your spending exceeds your income",
      body:
        `Across ${ctx.transactions.length} confirmed transaction(s), you ${
          balance >= 0 ? "earned more than you spent" : "spent more than you earned"
        }. Income ${incomeTotal} vs expenses ${expenseTotal} in minor units.`,
    });
  }

  // ---- Largest spending categories ---------------------------------------
  const catSpend = categorySpend(expenses);
  const named = [...catSpend.entries()]
    .map(([categoryId, row]) => ({
      categoryId: categoryId === "__none__" ? null : categoryId,
      name:
        categoryId === "__none__"
          ? "Uncategorized"
          : (ctx.categories.find((c) => c.id === categoryId)?.name ?? "Unknown category"),
      totalMinor: row.totalMinor,
      count: row.count,
    }))
    .sort((a, b) => b.totalMinor - a.totalMinor);

  if (named.length > 0) {
    const top = named[0];
    if (top && top.totalMinor > 0) {
      const share = Math.round((top.totalMinor / expenseTotal) * 100);
      insights.push({
        id: "largest-categories",
        kind: "largest-categories",
        tone: "info",
        title: "Your biggest spending area",
        body: `${top.name} accounts for ${share}% of your total expenses (${top.totalMinor} in minor units).`,
      });
    }
  }

  // ---- Spending by category (top 3) --------------------------------------
  if (named.length > 0) {
    const topThree = named.slice(0, 3);
    const summary = topThree
      .map((n) => `${n.name} (${n.totalMinor})`)
      .join(", ");
    insights.push({
      id: "category-spend",
      kind: "category-spend",
      tone: "info",
      title: "Where your money goes",
      body: `Your top expense categories are: ${summary}.`,
    });
  }

  // ---- Month-over-month change -------------------------------------------
  const expenseByMonth = new Map<string, number>();
  for (const t of expenses) {
    expenseByMonth.set(t.month, (expenseByMonth.get(t.month) ?? 0) + t.amountMinor);
  }
  const months = [...expenseByMonth.keys()].sort();
  if (months.length >= 2) {
    const cur = months[months.length - 1];
    const prev = months[months.length - 2];
    if (cur && prev) {
      const curTotal = expenseByMonth.get(cur) ?? 0;
      const prevTotal = expenseByMonth.get(prev) ?? 0;
      const diff = curTotal - prevTotal;
      const pct = prevTotal > 0 ? Math.round((diff / prevTotal) * 100) : null;
      const tone = diff > 0 ? "warning" : "positive";
      insights.push({
        id: "month-over-month",
        kind: "month-over-month",
        tone,
        title: diff > 0 ? "Your spending rose last month" : "Your spending eased last month",
        body:
          `${cur} expenses were ${curTotal} vs ${prevTotal} in ${prev} ` +
          (pct === null ? "" : `(${pct > 0 ? "+" : ""}${pct}%).`),
      });
    }
  }

  // ---- Unusually high category spending ----------------------------------
  for (const [categoryId, row] of catSpend) {
    if (row.count < MIN_TREND_POINTS) continue;
    const catMonths = new Map<string, number>();
    for (const t of expenses) {
      if ((t.categoryId ?? "__none__") !== categoryId) continue;
      catMonths.set(t.month, (catMonths.get(t.month) ?? 0) + t.amountMinor);
    }
    const catMonthKeys = [...catMonths.keys()];
    const last = catMonthKeys[catMonthKeys.length - 1];
    const rest = catMonthKeys.slice(0, -1);
    if (!last || rest.length === 0) continue;
    const lastTotal = catMonths.get(last) ?? 0;
    const avgOthers =
      rest.reduce((m, k) => m + (catMonths.get(k) ?? 0), 0) / rest.length;
    if (avgOthers <= 0) continue;
    if (lastTotal >= avgOthers * HIGH_CATEGORY_MULTIPLIER) {
      const name =
        categoryId === "__none__"
          ? "Uncategorized"
          : (ctx.categories.find((c) => c.id === categoryId)?.name ?? "Unknown category");
      insights.push({
        id: `high-category-${categoryId}`,
        kind: "high-category-spend",
        tone: "warning",
        title: "Unusually high category spending",
        body: `${name} spending in ${last} (${lastTotal}) was more than ${HIGH_CATEGORY_MULTIPLIER}x its monthly average.`,
      });
    }
  }

  // ---- Spending trend -----------------------------------------------------
  if (expenseByMonth.size >= MIN_TREND_POINTS) {
    const sorted = [...expenseByMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (first && last && first[0] !== last[0]) {
      const diff = last[1] - first[1];
      const span = monthDiff(first[0], last[0]);
      const trendLabel =
        diff > 0 ? "rising" : diff < 0 ? "falling" : "stable";
      insights.push({
        id: "trend",
        kind: "trend",
        tone: diff > 0 ? "warning" : "info",
        title: `Your spending is ${trendLabel}`,
        body:
          `From ${first[0]} (${first[1]}) to ${last[0]} (${last[1]}), monthly spending ${
            trendLabel === "stable"
              ? "stayed about the same"
              : `${trendLabel} by ${Math.round((diff / span) * 100) / 100} minor units/month`
          }.`,
      });
    }
  }

  return insights;
}

/** Unsupported internal helper used by the assistant for category grouping. */
export function spentByMonth(expenses: IntelligenceTransaction[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of expenses) {
    m.set(monthKeyFromIso(t.date), (m.get(monthKeyFromIso(t.date)) ?? 0) + t.amountMinor);
  }
  return m;
}
