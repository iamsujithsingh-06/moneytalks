import {
  AnalyticsGranularity,
  BudgetPeriod,
  resolveBudgetPeriodWindow,
  type AnalyticsGranularity as Granularity,
} from "@moneytalks/shared";
import type {
  AnalyticsCategoriesQuery,
  AnalyticsCashflowQuery,
  AnalyticsSummary,
  AnalyticsSummaryQuery,
  CashflowPoint,
  CashflowSeries,
  CategoryBreakdownItem,
  DashboardCategory,
  TopMerchant,
} from "@moneytalks/types";
import type { AppLogger } from "../../lib/logger.js";
import {
  categoryRepository,
  type CategoryRepository,
} from "../categories/repository.js";
import {
  analyticsRepository,
  type AnalyticsRepository,
  type AnalyticsTransaction,
} from "./repository.js";

export interface AnalyticsServiceDeps {
  logger: AppLogger;
  repository?: AnalyticsRepository;
  categoryRepository?: CategoryRepository;
}

const INCOME_TYPES = new Set(["income", "refund"]);
const EXPENSE_TYPES = new Set(["expense"]);

interface Window {
  from: Date;
  to: Date;
}

type Kind = "income" | "expense";

function classify(txn: AnalyticsTransaction): { kind: Kind; amount: number } | null {
  if (INCOME_TYPES.has(txn.type)) {
    return { kind: "income", amount: txn.amountMinor };
  }
  if (EXPENSE_TYPES.has(txn.type)) {
    return { kind: "expense", amount: txn.amountMinor };
  }
  return null;
}

function utcKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function monthKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function mondayOf(date: Date): Date {
  const day = startOfDay(date);
  const weekday = day.getUTCDay();
  const back = weekday === 0 ? 6 : weekday - 1;
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() - back));
}

function bucketKey(date: Date, granularity: Granularity): string {
  if (granularity === AnalyticsGranularity.Monthly) return monthKey(date);
  if (granularity === AnalyticsGranularity.Weekly) return utcKey(mondayOf(date));
  return utcKey(date);
}

function bucketLabels(from: Date, to: Date, granularity: Granularity): string[] {
  const labels: string[] = [];
  if (granularity === AnalyticsGranularity.Monthly) {
    let cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
    const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
    while (cursor <= end) {
      labels.push(monthKey(cursor));
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }
    return labels;
  }
  let cursor =
    granularity === AnalyticsGranularity.Weekly
      ? mondayOf(from)
      : startOfDay(from);
  const end = startOfDay(to);
  while (cursor <= end) {
    labels.push(utcKey(cursor));
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() + 1));
  }
  return labels;
}

function buildSeries(
  txns: AnalyticsTransaction[],
  window: Window,
  granularity: Granularity,
): CashflowPoint[] {
  const labels = bucketLabels(window.from, window.to, granularity);
  const counts = new Map<string, { income: number; expense: number }>();
  for (const label of labels) {
    counts.set(label, { income: 0, expense: 0 });
  }
  for (const txn of txns) {
    const classified = classify(txn);
    if (!classified) continue;
    const key = bucketKey(txn.transactionDate, granularity);
    const bucket = counts.get(key);
    if (!bucket) continue;
    if (classified.kind === "income") {
      bucket.income += classified.amount;
    } else {
      bucket.expense += classified.amount;
    }
  }
  const series: CashflowPoint[] = [];
  for (const label of labels) {
    const bucket = counts.get(label);
    const income = bucket?.income ?? 0;
    const expense = bucket?.expense ?? 0;
    series.push({ period: label, income, expense, net: income - expense });
  }
  return series;
}

export class AnalyticsService {
  private readonly repository: AnalyticsRepository;
  private readonly categoryRepo: CategoryRepository;

  constructor(private readonly deps: AnalyticsServiceDeps) {
    this.repository = deps.repository ?? analyticsRepository;
    this.categoryRepo = deps.categoryRepository ?? categoryRepository;
  }

  async summary(
    userId: string,
    query: AnalyticsSummaryQuery,
  ): Promise<AnalyticsSummary> {
    const window = this.resolveWindow(query.from, query.to);
    const granularity = query.granularity;
    const txns = await this.repository.fetchInWindow(userId, window);
    const categoryMap = await this.loadCategoryMap(userId);
    const trend = buildSeries(txns, window, granularity);
    const totals = this.totalIncomeExpense(txns);
    const categoryBreakdown = this.categoryBreakdown(txns, categoryMap);
    const topMerchants = this.topMerchants(txns, 5);
    return {
      income: totals.income,
      expense: totals.expense,
      cashFlow: totals.income - totals.expense,
      categoryBreakdown,
      trend,
      topMerchants,
      anomalies: [],
    };
  }

  async cashFlow(
    userId: string,
    query: AnalyticsCashflowQuery,
  ): Promise<CashflowSeries> {
    const window = this.resolveWindow(query.from, query.to);
    const txns = await this.repository.fetchInWindow(userId, window);
    return { series: buildSeries(txns, window, query.granularity) };
  }

  async categories(
    userId: string,
    query: AnalyticsCategoriesQuery,
  ): Promise<{ items: CategoryBreakdownItem[] }> {
    const window = this.resolveWindow(query.from, query.to);
    const txns = await this.repository.fetchInWindow(userId, window);
    const categoryMap = await this.loadCategoryMap(userId);
    const breakdown = this.categoryBreakdown(txns, categoryMap);
    const items = breakdown.filter((item) => item.type === query.type);
    items.sort((a, b) => b.totalMinor - a.totalMinor);
    return { items };
  }

  async topCategories(
    userId: string,
    from: string | undefined,
    to: string | undefined,
    limit = 5,
  ): Promise<DashboardCategory[]> {
    const window = this.resolveWindow(from, to);
    const txns = await this.repository.fetchInWindow(userId, window);
    const categoryMap = await this.loadCategoryMap(userId);
    const grouped = new Map<string, number>();
    for (const txn of txns) {
      const classified = classify(txn);
      if (!classified || classified.kind !== "expense") continue;
      if (!txn.categoryId) continue;
      grouped.set(txn.categoryId, (grouped.get(txn.categoryId) ?? 0) + classified.amount);
    }
    const sorted = [...grouped.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
    return sorted.map(([categoryId, totalMinor]) => ({
      categoryId,
      name: categoryMap.get(categoryId)?.name ?? "Uncategorized",
      totalMinor,
    }));
  }

  async balance(userId: string): Promise<number> {
    return this.repository.balance(userId);
  }

  /** Income/expense totals within an explicit inclusive window (minor units). */
  async totals(
    userId: string,
    window: { from: Date; to: Date },
  ): Promise<{ income: number; expense: number }> {
    const txns = await this.repository.fetchInWindow(userId, window);
    return this.totalIncomeExpense(txns);
  }

  private resolveWindow(from?: string, to?: string): Window {
    if (from && to) {
      return {
        from: new Date(`${from}T00:00:00.000Z`),
        to: new Date(`${to}T23:59:59.999Z`),
      };
    }
    if (from && !to) {
      return { from: new Date(`${from}T00:00:00.000Z`), to: new Date() };
    }
    if (to && !from) {
      return { from: timestampMin(), to: new Date(`${to}T23:59:59.999Z`) };
    }
    const window = resolveBudgetPeriodWindow(BudgetPeriod.Monthly, null, new Date());
    return { from: window.from, to: window.to };
  }

  private totalIncomeExpense(txns: AnalyticsTransaction[]): { income: number; expense: number } {
    let income = 0;
    let expense = 0;
    for (const txn of txns) {
      const classified = classify(txn);
      if (!classified) continue;
      if (classified.kind === "income") income += classified.amount;
      else expense += classified.amount;
    }
    return { income, expense };
  }

  private categoryBreakdown(
    txns: AnalyticsTransaction[],
    categoryMap: Map<string, { name: string; type: string }>,
  ): CategoryBreakdownItem[] {
    const grouped = new Map<string, { totalMinor: number; count: number; kind: Kind }>();
    for (const txn of txns) {
      const classified = classify(txn);
      if (!classified) continue;
      const key = txn.categoryId ?? "__uncategorized__";
      const row = grouped.get(key) ?? { totalMinor: 0, count: 0, kind: classified.kind };
      row.totalMinor += classified.amount;
      row.count += 1;
      grouped.set(key, row);
    }
    const items: CategoryBreakdownItem[] = [];
    for (const [key, row] of grouped) {
      const meta = key === "__uncategorized__" ? null : categoryMap.get(key);
      const type = meta?.type ?? (row.kind === "income" ? "income" : "expense");
      items.push({
        categoryId: key === "__uncategorized__" ? null : key,
        name: meta?.name ?? "Uncategorized",
        type,
        totalMinor: row.totalMinor,
        count: row.count,
      });
    }
    items.sort((a, b) => b.totalMinor - a.totalMinor);
    return items;
  }

  private topMerchants(txns: AnalyticsTransaction[], limit: number): TopMerchant[] {
    const grouped = new Map<string, { totalMinor: number; count: number }>();
    for (const txn of txns) {
      const classified = classify(txn);
      if (!classified || classified.kind !== "expense") continue;
      const merchant = txn.merchant;
      if (!merchant) continue;
      const row = grouped.get(merchant) ?? { totalMinor: 0, count: 0 };
      row.totalMinor += classified.amount;
      row.count += 1;
      grouped.set(merchant, row);
    }
    return [...grouped.entries()]
      .map(([merchant, row]) => ({ merchant, totalMinor: row.totalMinor, count: row.count }))
      .sort((a, b) => b.totalMinor - a.totalMinor)
      .slice(0, limit);
  }

  private async loadCategoryMap(
    userId: string,
  ): Promise<Map<string, { name: string; type: string }>> {
    const records = await this.categoryRepo.listByUser(userId);
    const map = new Map<string, { name: string; type: string }>();
    for (const record of records) {
      map.set(record.id, { name: record.name, type: record.type });
    }
    return map;
  }
}

function timestampMin(): Date {
  return new Date(0);
}
