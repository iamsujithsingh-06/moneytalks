import {
  BudgetPeriod,
  resolveBudgetPeriodWindow,
} from "@moneytalks/shared";
import type { TransactionPublic } from "@moneytalks/types";
import { offlineStore } from "../offline/index.js";
import { getInitialBalanceMinor } from "./settings.js";

/**
 * Offline dashboard computation.
 *
 * Replicates the server dashboard/analytics semantics (balance by direction,
 * month income/expense by type-classification, top spend) but reads from the
 * local offline `transactions` ledger so the dashboard works offline and
 * reflects confirmed captures immediately. Only confirmed, non-deleted
 * transactions are counted, matching the API analytics read-model.
 */

export interface DashboardTopSpend {
  name: string;
  totalMinor: number;
  count: number;
}

export interface DashboardData {
  /** All-time net balance (inflow − outflow) in minor units. */
  balance: number;
  monthIncome: number;
  monthExpense: number;
  net: number;
  /** Number of confirmed transactions today. */
  todayCount: number;
  /** Total circumstance expense today in minor units. */
  todayOutflow: number;
  /** Top merchants/spenders this month (expense only). */
  topSpend: DashboardTopSpend[];
  /** Most recent transactions (newest first). */
  recent: TransactionPublic[];
  /** Number of ops awaiting sync. */
  pendingSyncCount: number;
}

const INCOME_TYPES = new Set(["income", "refund"]);
const EXPENSE_TYPES = new Set(["expense"]);
const BALANCE_TYPES = new Set(["income", "expense", "refund"]);

function classify(
  txn: Readonly<{
    type: string;
    amountMinor: number;
  }>,
): { kind: "income" | "expense"; amount: number } | null {
  if (INCOME_TYPES.has(txn.type)) {
    return { kind: "income", amount: txn.amountMinor };
  }
  if (EXPENSE_TYPES.has(txn.type)) {
    return { kind: "expense", amount: txn.amountMinor };
  }
  return null;
}

function dayKey(iso: string): string {
  return String(iso).slice(0, 10);
}

/** Type-derived direction fallback (server uses `deriveTransactionDirection`). */
function directionFromType(type: string): "inflow" | "outflow" {
  if (type === "income" || type === "refund") return "inflow";
  return "outflow";
}

/** Load the confirmed, non-deleted fold of the offline ledger. */
export async function loadLedger(): Promise<TransactionPublic[]> {
  const all = await offlineStore.list("transactions");
  return all.filter(
    (t) =>
      t.status === "confirmed" &&
      !(t as unknown as { deleted?: boolean }).deleted,
  );
}

export function computeDashboard(
  transactions: ReadonlyArray<Readonly<TransactionPublic>>,
  opts: {
    now?: Date;
    pendingSyncCount?: number;
    limit?: number;
    initialBalanceMinor?: number;
  } = {},
): DashboardData {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 5;
  const window = resolveBudgetPeriodWindow(BudgetPeriod.Monthly, null, now);

  // Balance = Initial Balance + Income - Expenses. The initial balance is a
  // user setting, not a transaction, and never counts toward month income/
  // expense below.
  let balance = opts.initialBalanceMinor ?? 0;
  let monthIncome = 0;
  let monthExpense = 0;
  let todayCount = 0;
  let todayOutflow = 0;
  const todayKey = dayKey(now.toISOString());
  const monthStartKey = dayKey(window.from.toISOString());
  const monthEndKey = dayKey(window.to.toISOString());

  function inMonth(txn: Readonly<TransactionPublic>): boolean {
    const key = dayKey(txn.transactionDate);
    return key >= monthStartKey && key <= monthEndKey;
  }

  const merchants = new Map<string, { totalMinor: number; count: number }>();

  for (const txn of transactions) {
    if (BALANCE_TYPES.has(txn.type)) {
      const direction = txn.direction ?? directionFromType(txn.type);
      if (direction === "inflow") balance += txn.amountMinor;
      else balance -= txn.amountMinor;
    }

    const classified = classify(txn);
    if (classified && inMonth(txn)) {
      if (classified.kind === "income") monthIncome += classified.amount;
      else monthExpense += classified.amount;
    }

    if (dayKey(txn.transactionDate) === todayKey) {
      todayCount += 1;
      if (classified && classified.kind === "expense") {
        todayOutflow += classified.amount;
      }
    }

    if (classified?.kind === "expense" && txn.merchant) {
      const row = merchants.get(txn.merchant) ?? { totalMinor: 0, count: 0 };
      row.totalMinor += classified.amount;
      row.count += 1;
      merchants.set(txn.merchant, row);
    }
  }

  const topSpend = [...merchants.entries()]
    .map(([name, row]) => ({ name, ...row }))
    .sort((a, b) => b.totalMinor - a.totalMinor)
    .slice(0, 5);

  const recent = [...transactions]
    .sort(
      (a, b) =>
        String(b.transactionDate).localeCompare(String(a.transactionDate)) ||
        String(b.createdAt).localeCompare(String(a.createdAt)),
    )
    .slice(0, limit);

  return {
    balance,
    monthIncome,
    monthExpense,
    net: monthIncome - monthExpense,
    todayCount,
    todayOutflow,
    topSpend,
    recent,
    pendingSyncCount: opts.pendingSyncCount ?? 0,
  };
}

/** Compute the full dashboard from the offline ledger directly. */
export async function computeDashboardFromLedger(
  opts: { now?: Date; limit?: number } = {},
): Promise<DashboardData> {
  const [transactions, pendingSyncCount, initialBalanceMinor] =
    await Promise.all([
      loadLedger(),
      offlineStore.pendingCount(),
      getInitialBalanceMinor(),
    ]);
  return computeDashboard(transactions, {
    ...opts,
    pendingSyncCount,
    initialBalanceMinor,
  });
}
