import { Types } from "mongoose";
import { TransactionModel } from "../../db/models/transaction.js";

export interface AnalyticsWindow {
  from: Date;
  to: Date;
}

/** Read-model projection of a transaction for analytics computations. */
export interface AnalyticsTransaction {
  type: string;
  direction: string;
  amountMinor: number;
  categoryId: string | null;
  transactionDate: Date;
  merchant: string | null;
}

export interface AnalyticsRepository {
  /**
   * Loads confirmed, non-deleted transactions of a user falling inside the
   * inclusive `[from, to]` window, projected to the analytics read-model.
   */
  fetchInWindow(
    userId: string | Types.ObjectId,
    window: AnalyticsWindow,
  ): Promise<AnalyticsTransaction[]>;
  /**
   * Sums all-time inflow minus outflow in minor units across the user's
   * confirmed, non-deleted transactions. Returns an integer that may be
   * negative.
   */
  balance(userId: string | Types.ObjectId): Promise<number>;
}

type LeanTxn = {
  type: string;
  direction: string;
  amountMinor: number;
  categoryId?: Types.ObjectId | null;
  transactionDate: Date;
  merchant?: string | null;
};

function toAnalyticsTxn(doc: LeanTxn): AnalyticsTransaction {
  return {
    type: doc.type,
    direction: doc.direction,
    amountMinor: doc.amountMinor,
    categoryId: doc.categoryId ? doc.categoryId.toString() : null,
    transactionDate: doc.transactionDate,
    merchant: doc.merchant ?? null,
  };
}

export function createAnalyticsRepository(): AnalyticsRepository {
  async function fetchInWindow(
    userId: string | Types.ObjectId,
    window: AnalyticsWindow,
  ): Promise<AnalyticsTransaction[]> {
    const docs = await TransactionModel.find<
      LeanTxn & { _id: unknown }
    >({
      userId: new Types.ObjectId(userId),
      status: "confirmed",
      deletedAt: null,
      transactionDate: { $gte: window.from, $lte: window.to },
    })
      .select({
        type: 1,
        direction: 1,
        amountMinor: 1,
        categoryId: 1,
        transactionDate: 1,
        merchant: 1,
      })
      .lean()
      .exec();
    return docs.map(toAnalyticsTxn);
  }

  async function balance(
    userId: string | Types.ObjectId,
  ): Promise<number> {
    const rows = await TransactionModel.aggregate<{ net: number }>([
      {
        $match: {
          userId: new Types.ObjectId(userId),
          status: "confirmed",
          deletedAt: null,
          type: { $in: ["income", "expense", "refund"] },
        },
      },
      {
        $group: {
          _id: null,
          net: {
            $sum: {
              $cond: [
                { $eq: ["$direction", "inflow"] },
                "$amountMinor",
                { $subtract: [0, "$amountMinor"] },
              ],
            },
          },
        },
      },
    ]).exec();
    return rows[0]?.net ?? 0;
  }

  return { fetchInWindow, balance };
}

export const analyticsRepository = createAnalyticsRepository();
