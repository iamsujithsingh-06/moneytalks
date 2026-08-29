/**
 * Internal read-models consumed by the deterministic intelligence engine.
 * These are normalized, typed projections of existing MoneyTalks data — the
 * engine never writes and never invents facts.
 */

export type TransactionKind = "income" | "expense";

/** Minimal transaction projection used by all intelligence computations. */
export interface IntelligenceTransaction {
  id: string;
  type: string;
  amountMinor: number;
  currency: string;
  /** ISO date string (YYYY-MM-DD). */
  date: string;
  merchant: string | null;
  categoryId: string | null;
  /** YYYY-MM bucket derived from `date`. */
  month: string;
  /** true when `type` counts as income (income|refund). */
  isIncome: boolean;
  /** true when `type` counts as expense. */
  isExpense: boolean;
}

/** Category projection (id -> name/type). */
export interface IntelligenceCategory {
  id: string;
  name: string;
  type: string;
}

/** Budget projection with period and allocation. */
export interface IntelligenceBudget {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  scope: string;
  period: string;
  periodAnchor: string | null;
  allocatedMinor: number;
  currency: string;
  /** Inclusive UTC window for the current budget period (computed by caller). */
  window: { from: Date; to: Date };
}

/** All the data the engine needs for a single user (already user-isolated). */
export interface IntelligenceContext {
  /** Confirmed, non-deleted expense/income transactions (full user history). */
  transactions: IntelligenceTransaction[];
  categories: IntelligenceCategory[];
  budgets: IntelligenceBudget[];
  currency: string;
  /** Reference "now" date (YYYY-MM-DD). */
  now: string;
}
