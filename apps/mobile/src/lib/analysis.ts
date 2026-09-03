import { BudgetPeriod, resolveBudgetPeriodWindow } from "@moneytalks/shared";
import type { BudgetPeriodWindow } from "@moneytalks/shared";
import type { TransactionPublic } from "@moneytalks/types";

export type AnalysisPeriod = "weekly" | "monthly";

export interface TrendPoint {
  /** YYYY-MM-DD bucket key */
  key: string;
  /** Short display label: "Mon" / "1" */
  label: string;
  expense: number;
  income: number;
}

export interface CategoryItem {
  name: string;
  totalMinor: number;
  count: number;
}

export interface AnalysisInsight {
  id: string;
  kind: string;
  title: string;
  body: string;
  tone: "info" | "positive" | "warning" | "negative";
}

export interface PeriodMetrics {
  income: number;
  expense: number;
  netSavings: number;
  avgDailySpend: number;
}

export interface AnalysisData {
  period: AnalysisPeriod;
  window: BudgetPeriodWindow;
  prevWindow: BudgetPeriodWindow;
  income: number;
  expense: number;
  netSavings: number;
  avgDailySpend: number;
  daysInPeriod: number;
  trend: TrendPoint[];
  highestDay: TrendPoint | null;
  categories: CategoryItem[];
  topCategories: CategoryItem[];
  prev: PeriodMetrics;
  delta: PeriodMetrics;
  insights: AnalysisInsight[];
}

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayKey(iso: string): string {
  return String(iso).slice(0, 10);
}

function classify(
  txn: Readonly<{ type: string; amountMinor: number }>,
): { kind: "income" | "expense"; amount: number } | null {
  if (txn.type === "income" || txn.type === "refund") {
    return { kind: "income", amount: txn.amountMinor };
  }
  if (txn.type === "expense") {
    return { kind: "expense", amount: txn.amountMinor };
  }
  return null;
}

function formatDayLabel(iso: string, period: AnalysisPeriod): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (period === "weekly") return SHORT_DAYS[d.getUTCDay()] ?? String(d.getUTCDay());
  return String(d.getUTCDate());
}

function previousPeriodWindow(
  period: AnalysisPeriod,
  now: Date,
): BudgetPeriodWindow {
  if (period === "weekly") {
    const prev = new Date(now);
    prev.setUTCDate(prev.getUTCDate() - 7);
    return resolveBudgetPeriodWindow(BudgetPeriod.Weekly, null, prev);
  }
  const firstOfMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const prev = new Date(firstOfMonth);
  prev.setUTCDate(prev.getUTCDate() - 1);
  return resolveBudgetPeriodWindow(BudgetPeriod.Monthly, null, prev);
}

function daysBetween(from: Date, to: Date): number {
  const fromKey = dayKey(from.toISOString());
  const toKey = dayKey(to.toISOString());
  const start = new Date(`${fromKey}T00:00:00.000Z`);
  const end = new Date(`${toKey}T00:00:00.000Z`);
  const msPerDay = 86_400_000;
  return Math.round((end.getTime() - start.getTime()) / msPerDay) + 1;
}

function buildDayMap(
  window: BudgetPeriodWindow,
): Map<string, { income: number; expense: number }> {
  const map = new Map<string, { income: number; expense: number }>();
  const cursor = new Date(window.from);
  while (cursor <= window.to) {
    map.set(dayKey(cursor.toISOString()), { income: 0, expense: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return map;
}

function computePeriodMetrics(
  transactions: ReadonlyArray<Readonly<TransactionPublic>>,
  window: BudgetPeriodWindow,
  period: AnalysisPeriod,
): {
  income: number;
  expense: number;
  trend: TrendPoint[];
  categories: CategoryItem[];
  highestDay: TrendPoint | null;
} {
  const startKey = dayKey(window.from.toISOString());
  const endKey = dayKey(window.to.toISOString());
  const dayMap = buildDayMap(window);
  const merchantMap = new Map<string, { totalMinor: number; count: number }>();

  let income = 0;
  let expense = 0;

  for (const txn of transactions) {
    const key = dayKey(txn.transactionDate);
    if (key < startKey || key > endKey) continue;

    const c = classify(txn);
    if (!c) continue;

    if (c.kind === "income") {
      income += c.amount;
    } else {
      expense += c.amount;
    }

    const bucket = dayMap.get(key);
    if (bucket) {
      if (c.kind === "income") bucket.income += c.amount;
      else bucket.expense += c.amount;
    }

    if (c.kind === "expense" && txn.merchant) {
      const row = merchantMap.get(txn.merchant) ?? { totalMinor: 0, count: 0 };
      row.totalMinor += c.amount;
      row.count += 1;
      merchantMap.set(txn.merchant, row);
    }
  }

  const trend: TrendPoint[] = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, data]) => ({
      key,
      label: formatDayLabel(key, period),
      expense: data.expense,
      income: data.income,
    }));

  let highestDay: TrendPoint | null = null;
  for (const pt of trend) {
    if (pt.expense > 0 && (!highestDay || pt.expense > highestDay.expense)) {
      highestDay = pt;
    }
  }

  const categories: CategoryItem[] = [...merchantMap.entries()]
    .map(([name, row]) => ({ name, ...row }))
    .sort((a, b) => b.totalMinor - a.totalMinor);

  return { income, expense, trend, categories, highestDay };
}

function computeMetrics(
  income: number,
  expense: number,
  days: number,
): PeriodMetrics {
  return {
    income,
    expense,
    netSavings: income - expense,
    avgDailySpend: days > 0 ? Math.round(expense / days) : 0,
  };
}

function generateInsights(
  current: PeriodMetrics,
  prev: PeriodMetrics,
  topCategories: CategoryItem[],
  highestDay: TrendPoint | null,
  period: AnalysisPeriod,
  daysInPeriod: number,
  daysInPrevPeriod: number,
): AnalysisInsight[] {
  const insights: AnalysisInsight[] = [];
  let id = 0;

  const savingsRate =
    current.income > 0
      ? Math.round((current.netSavings / current.income) * 100)
      : 0;

  if (current.income > 0 && current.expense > 0) {
    if (savingsRate > 0) {
      insights.push({
        id: `insight-${++id}`,
        kind: "savings-rate",
        title: `You're saving ${savingsRate}% this ${period}`,
        body: `Of your income, ₹${Math.round(current.income / 100).toLocaleString("en-IN")} you've saved ₹${Math.round(current.netSavings / 100).toLocaleString("en-IN")}.`,
        tone: savingsRate >= 20 ? "positive" : "info",
      });
    } else {
      insights.push({
        id: `insight-${++id}`,
        kind: "overspend",
        title: "Spending exceeds income",
        body: `You've spent ₹${Math.round(current.expense / 100).toLocaleString("en-IN")} against ₹${Math.round(current.income / 100).toLocaleString("en-IN")} income this ${period}.`,
        tone: "warning",
      });
    }
  }

  if (prev.expense > 0) {
    const changePct = Math.round(
      ((current.expense - prev.expense) / prev.expense) * 100,
    );
    if (changePct > 10) {
      insights.push({
        id: `insight-${++id}`,
        kind: "spend-up",
        title: `Spending up ${changePct}% vs previous ${period}`,
        body: `Expenses increased from ₹${Math.round(prev.expense / 100).toLocaleString("en-IN")} to ₹${Math.round(current.expense / 100).toLocaleString("en-IN")}.`,
        tone: "warning",
      });
    } else if (changePct < -10) {
      insights.push({
        id: `insight-${++id}`,
        kind: "spend-down",
        title: `Spending down ${Math.abs(changePct)}% vs previous ${period}`,
        body: `Expenses decreased from ₹${Math.round(prev.expense / 100).toLocaleString("en-IN")} to ₹${Math.round(current.expense / 100).toLocaleString("en-IN")}. Great job!`,
        tone: "positive",
      });
    }
  }

  const [top] = topCategories;
  if (top) {
    const pct =
      current.expense > 0
        ? Math.round((top.totalMinor / current.expense) * 100)
        : 0;
    insights.push({
      id: `insight-${++id}`,
      kind: "top-category",
      title: `${top.name} is your biggest spend`,
      body: `₹${Math.round(top.totalMinor / 100).toLocaleString("en-IN")} across ${top.count} transaction${top.count > 1 ? "s" : ""} — ${pct}% of total spending.`,
      tone: pct > 40 ? "negative" : "info",
    });
  }

  if (highestDay && daysInPeriod > 1) {
    const dateStr = new Date(`${highestDay.key}T00:00:00.000Z`).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    });
    insights.push({
      id: `insight-${++id}`,
      kind: "highest-day",
      title: `Highest spending on ${dateStr}`,
      body: `₹${Math.round(highestDay.expense / 100).toLocaleString("en-IN")} spent on ${highestDay.label}.`,
      tone: "info",
    });
  }

  const avgPrev = daysInPrevPeriod > 0 ? Math.round(prev.expense / daysInPrevPeriod) : 0;
  if (avgPrev > 0 && current.avgDailySpend > 0) {
    const avgChange = Math.round(((current.avgDailySpend - avgPrev) / avgPrev) * 100);
    if (Math.abs(avgChange) > 5) {
      const dir = avgChange > 0 ? "increased" : "decreased";
      insights.push({
        id: `insight-${++id}`,
        kind: "avg-daily",
        title: `Daily average ${dir} ${Math.abs(avgChange)}%`,
        body: `₹${Math.round(current.avgDailySpend / 100).toLocaleString("en-IN")}/day this ${period} vs ₹${Math.round(avgPrev / 100).toLocaleString("en-IN")}/day previously.`,
        tone: avgChange > 0 ? "negative" : "positive",
      });
    }
  }

  return insights;
}

export function computeAnalysis(
  transactions: ReadonlyArray<Readonly<TransactionPublic>>,
  period: AnalysisPeriod,
  now: Date,
): AnalysisData {
  const window =
    period === "weekly"
      ? resolveBudgetPeriodWindow(BudgetPeriod.Weekly, null, now)
      : resolveBudgetPeriodWindow(BudgetPeriod.Monthly, null, now);

  const prevWindow = previousPeriodWindow(period, now);
  const daysInPeriod = daysBetween(window.from, window.to);
  const daysInPrevPeriod = daysBetween(prevWindow.from, prevWindow.to);

  const current = computePeriodMetrics(transactions, window, period);
  const prevRaw = computePeriodMetrics(transactions, prevWindow, period);

  const currentMetrics = computeMetrics(
    current.income,
    current.expense,
    daysInPeriod,
  );
  const prevMetrics = computeMetrics(
    prevRaw.income,
    prevRaw.expense,
    daysInPrevPeriod > 0 ? daysInPrevPeriod : 1,
  );

  const delta: PeriodMetrics = {
    income: currentMetrics.income - prevMetrics.income,
    expense: currentMetrics.expense - prevMetrics.expense,
    netSavings: currentMetrics.netSavings - prevMetrics.netSavings,
    avgDailySpend: currentMetrics.avgDailySpend - prevMetrics.avgDailySpend,
  };

  const topCategories = current.categories.slice(0, 3);

  const insights = generateInsights(
    currentMetrics,
    prevMetrics,
    topCategories,
    current.highestDay,
    period,
    daysInPeriod,
    daysInPrevPeriod,
  );

  return {
    period,
    window,
    prevWindow,
    income: current.income,
    expense: current.expense,
    netSavings: currentMetrics.netSavings,
    avgDailySpend: currentMetrics.avgDailySpend,
    daysInPeriod,
    trend: current.trend,
    highestDay: current.highestDay,
    categories: current.categories,
    topCategories,
    prev: prevMetrics,
    delta,
    insights,
  };
}
