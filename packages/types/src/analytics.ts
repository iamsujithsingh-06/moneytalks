import type {
  AnalyticsCashflowQuery,
  AnalyticsCategoriesQuery,
  AnalyticsSummaryQuery,
} from "@moneytalks/validation";

export type {
  AnalyticsCashflowQuery,
  AnalyticsCategoriesQuery,
  AnalyticsSummaryQuery,
} from "@moneytalks/validation";

export type AnalyticsGranularity =
  import("@moneytalks/shared").AnalyticsGranularity;

/** One bucketed point in a cash-flow / trend series (integer minor units). */
export interface CashflowPoint {
  /** Bucket label per granularity: `YYYY-MM-DD` (daily), `YYYY-MM-DD` of the
   * Monday (weekly), or `YYYY-MM` (monthly). */
  period: string;
  income: number;
  expense: number;
  net: number;
}

export interface CashflowSeries {
  series: CashflowPoint[];
}

export interface CategoryBreakdownItem {
  categoryId: string | null;
  name: string;
  type: string;
  totalMinor: number;
  count: number;
}

export interface TopMerchant {
  merchant: string;
  totalMinor: number;
  count: number;
}

export interface AnalyticsSummary {
  income: number;
  expense: number;
  cashFlow: number;
  categoryBreakdown: CategoryBreakdownItem[];
  trend: CashflowPoint[];
  topMerchants: TopMerchant[];
  anomalies: unknown[];
}

export interface DashboardCategory {
  categoryId: string;
  name: string;
  totalMinor: number;
}

/** Minimal savings-goal shape. Goals are implemented in a later phase; the
 * dashboard returns an empty array until then. */
export interface SavingsGoalPublic {
  id: string;
  name: string;
  targetMinor: number;
  currency: string;
  savedMinor: number;
  targetDate: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  rev: number;
}

/** Minimal AI insight-card shape. The insights engine is a later phase; the
 * dashboard returns an empty array until then. */
export interface InsightCard {
  id: string;
  kind: string;
  title: string;
  body: string;
}

import type { TransactionPublic, BudgetPublic } from "@moneytalks/types";

export interface DashboardSummary {
  balance: number;
  monthIncome: number;
  monthExpense: number;
  net: number;
  topCategories: DashboardCategory[];
  recent: TransactionPublic[];
  budgets: BudgetPublic[];
  goals: SavingsGoalPublic[];
  insights: InsightCard[];
}
