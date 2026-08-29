import { Types } from "mongoose";
import { BudgetPeriod, resolveBudgetPeriodWindow } from "@moneytalks/shared";
import type { IntelligenceContext } from "@moneytalks/intelligence";
import { TransactionModel } from "../../db/models/transaction.js";
import type { CategoryRepository } from "../categories/repository.js";
import { categoryRepository } from "../categories/repository.js";
import type { BudgetRepository } from "../budgets/repository.js";
import { budgetRepository } from "../budgets/repository.js";

/** Read-model projection of a transaction for the intelligence engine. */
export interface IntelligenceTxDoc {
  id: string;
  type: string;
  amountMinor: number;
  currency: string;
  transactionDate: Date;
  merchant: string | null;
  categoryId: string | null;
}

export interface IntelligenceRepository {
  /**
   * Loads all confirmed, non-deleted transactions of a user, projected to the
   * intelligence read-model. Read-only — nothing is ever written or modified.
   */
  fetchTransactions(userId: string | Types.ObjectId): Promise<IntelligenceTxDoc[]>;
  /**
   * Assembles the full user-isolated intelligence context: transactions,
   * categories, active budgets (with resolved period windows) and the
   * reference timestamp. Never crosses users.
   */
  buildContext(userId: string | Types.ObjectId): Promise<IntelligenceContext>;
}

type LeanTxn = {
  _id: unknown;
  type: string;
  amountMinor: number;
  currency?: string;
  transactionDate: Date;
  merchant?: string | null;
  categoryId?: Types.ObjectId | null;
};

function toTxDoc(doc: LeanTxn): IntelligenceTxDoc {
  return {
    id: String(doc._id),
    type: doc.type,
    amountMinor: doc.amountMinor,
    currency: doc.currency ?? "USD",
    transactionDate: doc.transactionDate,
    merchant: doc.merchant ?? null,
    categoryId: doc.categoryId ? doc.categoryId.toString() : null,
  };
}

export function createIntelligenceRepository(
  categoryRepo: CategoryRepository = categoryRepository,
  budgetRepo: BudgetRepository = budgetRepository,
): IntelligenceRepository {
  async function fetchTransactions(
    userId: string | Types.ObjectId,
  ): Promise<IntelligenceTxDoc[]> {
    const docs = await TransactionModel.find<LeanTxn>({
      userId: new Types.ObjectId(userId),
      status: "confirmed",
      deletedAt: null,
    })
      .select({
        type: 1,
        amountMinor: 1,
        currency: 1,
        transactionDate: 1,
        merchant: 1,
        categoryId: 1,
      })
      .lean()
      .exec();
    return docs.map(toTxDoc);
  }

  async function buildContext(
    userId: string | Types.ObjectId,
  ): Promise<IntelligenceContext> {
    const [txs, categories, budgets] = await Promise.all([
      fetchTransactions(userId),
      categoryRepo.listByUser(userId),
      budgetRepo.listByUser(userId),
    ]);

    const categoryMap = new Map<string, { name: string; type: string }>();
    for (const c of categories) {
      categoryMap.set(c.id, { name: c.name, type: c.type });
    }

    const nowDate = new Date();
    const now = utcDay(nowDate);

    const currency = deriveCurrency(txs);

    return {
      transactions: txs.map((t) => {
        const isIncome = t.type === "income" || t.type === "refund";
        return {
          id: t.id,
          type: t.type,
          amountMinor: t.amountMinor,
          currency: t.currency,
          date: utcDay(t.transactionDate),
          merchant: t.merchant,
          categoryId: t.categoryId,
          month: utcDay(t.transactionDate).slice(0, 7),
          isIncome,
          isExpense: t.type === "expense",
        };
      }),
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
      })),
      budgets: budgets.map((b) => {
        const window = resolveBudgetPeriodWindow(
          b.period as BudgetPeriod,
          b.periodAnchor,
          nowDate,
        );
        return {
          id: b.id,
          categoryId: b.categoryId,
          categoryName: b.categoryId ? categoryMap.get(b.categoryId)?.name ?? null : null,
          scope: b.scope,
          period: b.period,
          periodAnchor: b.periodAnchor ? b.periodAnchor.toISOString() : null,
          allocatedMinor: b.allocatedMinor,
          currency: b.currency,
          window,
        };
      }),
      currency,
      now,
    };
  }

  return { fetchTransactions, buildContext };
}

/** Derives a display currency from the user's transactions; defaults to USD. */
function deriveCurrency(txs: IntelligenceTxDoc[]): string {
  const counts = new Map<string, number>();
  for (const t of txs) {
    counts.set(t.currency, (counts.get(t.currency) ?? 0) + 1);
  }
  let best = "USD";
  let bestCount = 0;
  for (const [cur, count] of counts) {
    if (count > bestCount) {
      best = cur;
      bestCount = count;
    }
  }
  return best || "USD";
}

function utcDay(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const intelligenceRepository = createIntelligenceRepository();
