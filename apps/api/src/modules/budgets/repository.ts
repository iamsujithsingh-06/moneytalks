import { Types } from "mongoose";
import { BudgetScope, BudgetStatus } from "@moneytalks/shared";
import {
  BudgetModel,
  type BudgetAlertThresholdsFields,
  type BudgetDocumentFields,
} from "../../db/models/budget.js";
import { TransactionModel } from "../../db/models/transaction.js";

export interface NewBudgetRecord {
  userId: Types.ObjectId | string;
  clientId: string;
  categoryId?: Types.ObjectId | string | null;
  scope: string;
  period: string;
  periodAnchor?: Date | string | null;
  allocatedMinor: number;
  currency: string;
  rollover?: boolean;
  status?: string;
  alertThresholds: BudgetAlertThresholdsFields;
}

export interface BudgetRecord {
  id: string;
  userId: string;
  clientId: string;
  categoryId: string | null;
  scope: string;
  period: string;
  periodAnchor: Date | null;
  allocatedMinor: number;
  currency: string;
  rollover: boolean;
  status: string;
  alertThresholds: BudgetAlertThresholdsFields;
  deletedAt: Date | null;
  deletedBy: string | null;
  rev: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface BudgetUpdateRecord {
  categoryId?: Types.ObjectId | string | null;
  period?: string;
  periodAnchor?: Date | string | null;
  allocatedMinor?: number;
  currency?: string;
  rollover?: boolean;
  status?: string;
  alertThresholds?: BudgetAlertThresholdsFields;
}

export interface BudgetListFilter {
  period?: string;
}

export interface BudgetDuplicateCriteria {
  scope: string;
  categoryId?: Types.ObjectId | string | null;
  period: string;
}

export interface BudgetSpendWindow {
  from: Date;
  to: Date;
}

export interface AggregateBudgetSpendInput {
  userId: Types.ObjectId | string;
  currency: string;
  from: Date;
  to: Date;
  categoryId?: Types.ObjectId | string | null;
}

export interface BudgetSpendResult {
  spentMinor: number;
}

export interface BudgetRepository {
  create(input: NewBudgetRecord): Promise<BudgetRecord>;
  findById(
    userId: string | Types.ObjectId,
    budgetId: string | Types.ObjectId,
  ): Promise<BudgetRecord | null>;
  findActiveById(
    userId: string | Types.ObjectId,
    budgetId: string | Types.ObjectId,
  ): Promise<BudgetRecord | null>;
  listByUser(
    userId: string | Types.ObjectId,
    filter?: BudgetListFilter,
  ): Promise<BudgetRecord[]>;
  findActiveDuplicate(
    userId: string | Types.ObjectId,
    criteria: BudgetDuplicateCriteria,
  ): Promise<BudgetRecord | null>;
  update(
    userId: string | Types.ObjectId,
    budgetId: string | Types.ObjectId,
    update: BudgetUpdateRecord,
  ): Promise<BudgetRecord | null>;
  softDelete(
    userId: string | Types.ObjectId,
    budgetId: string | Types.ObjectId,
    deletedBy: string | Types.ObjectId,
  ): Promise<BudgetRecord | null>;
  aggregateSpend(input: AggregateBudgetSpendInput): Promise<BudgetSpendResult>;
}

type BudgetDoc = BudgetDocumentFields & { _id: Types.ObjectId };

function toRecord(doc: BudgetDoc): BudgetRecord {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    clientId: doc.clientId,
    categoryId: doc.categoryId ? doc.categoryId.toString() : null,
    scope: doc.scope,
    period: doc.period,
    periodAnchor: doc.periodAnchor ?? null,
    allocatedMinor: doc.allocatedMinor,
    currency: doc.currency,
    rollover: doc.rollover ?? false,
    status: doc.status ?? BudgetStatus.Active,
    alertThresholds: {
      warningPct: doc.alertThresholds.warningPct,
      hardPct: doc.alertThresholds.hardPct,
    },
    deletedAt: doc.deletedAt ?? null,
    deletedBy: doc.deletedBy ? doc.deletedBy.toString() : null,
    rev: doc.rev ?? 0,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function createBudgetRepository(): BudgetRepository {
  async function create(input: NewBudgetRecord) {
    const doc = await BudgetModel.create({
      userId: input.userId,
      clientId: input.clientId,
      categoryId: input.categoryId ?? undefined,
      scope: input.scope,
      period: input.period,
      periodAnchor: input.periodAnchor ?? null,
      allocatedMinor: input.allocatedMinor,
      currency: input.currency,
      rollover: input.rollover ?? false,
      status: input.status ?? BudgetStatus.Active,
      alertThresholds: input.alertThresholds,
    });
    return toRecord(doc);
  }

  async function findById(
    userId: string | Types.ObjectId,
    budgetId: string | Types.ObjectId,
  ) {
    const doc = await BudgetModel.findOne({ _id: budgetId, userId }).exec();
    return doc ? toRecord(doc) : null;
  }

  async function findActiveById(
    userId: string | Types.ObjectId,
    budgetId: string | Types.ObjectId,
  ) {
    const doc = await BudgetModel.findOne({
      _id: budgetId,
      userId,
      deletedAt: null,
    }).exec();
    return doc ? toRecord(doc) : null;
  }

  async function listByUser(
    userId: string | Types.ObjectId,
    filter: BudgetListFilter = {},
  ) {
    const query: Record<string, unknown> = { userId, deletedAt: null };
    if (filter.period) query.period = filter.period;
    const docs = await BudgetModel.find(query)
      .sort({ createdAt: 1, _id: 1 })
      .exec();
    return docs.map(toRecord);
  }

  async function findActiveDuplicate(
    userId: string | Types.ObjectId,
    criteria: BudgetDuplicateCriteria,
  ) {
    const query: Record<string, unknown> = {
      userId,
      period: criteria.period,
      status: BudgetStatus.Active,
      deletedAt: null,
    };
    if (criteria.categoryId == null || criteria.scope === BudgetScope.Overall) {
      query.scope = BudgetScope.Overall;
    } else {
      query.categoryId = new Types.ObjectId(criteria.categoryId);
    }
    const doc = await BudgetModel.findOne(query).exec();
    return doc ? toRecord(doc) : null;
  }

  async function update(
    userId: string | Types.ObjectId,
    budgetId: string | Types.ObjectId,
    update: BudgetUpdateRecord,
  ) {
    const set: Record<string, unknown> = {};
    if (update.categoryId !== undefined) set.categoryId = update.categoryId ?? null;
    if (update.period !== undefined) set.period = update.period;
    if (update.periodAnchor !== undefined) {
      set.periodAnchor = update.periodAnchor ?? null;
    }
    if (update.allocatedMinor !== undefined) {
      set.allocatedMinor = update.allocatedMinor;
    }
    if (update.currency !== undefined) set.currency = update.currency;
    if (update.rollover !== undefined) set.rollover = update.rollover;
    if (update.status !== undefined) set.status = update.status;
    if (update.alertThresholds !== undefined) {
      set.alertThresholds = update.alertThresholds;
    }

    const doc = await BudgetModel.findOneAndUpdate(
      { _id: budgetId, userId, deletedAt: null },
      { $set: set, $inc: { rev: 1 } },
      { new: true },
    ).exec();
    return doc ? toRecord(doc) : null;
  }

  async function softDelete(
    userId: string | Types.ObjectId,
    budgetId: string | Types.ObjectId,
    deletedBy: string | Types.ObjectId,
  ) {
    const doc = await BudgetModel.findOneAndUpdate(
      { _id: budgetId, userId, deletedAt: null },
      { $set: { deletedAt: new Date(), deletedBy }, $inc: { rev: 1 } },
      { new: true },
    ).exec();
    return doc ? toRecord(doc) : null;
  }

  async function aggregateSpend(
    input: AggregateBudgetSpendInput,
  ): Promise<BudgetSpendResult> {
    const match: Record<string, unknown> = {
      userId: new Types.ObjectId(input.userId),
      status: "confirmed",
      deletedAt: null,
      type: "expense",
      currency: input.currency,
      transactionDate: { $gte: input.from, $lte: input.to },
    };
    if (input.categoryId) {
      match.categoryId = new Types.ObjectId(input.categoryId);
    }
    const rows = await TransactionModel.aggregate<{ spentMinor: number }>([
      { $match: match },
      { $group: { _id: null, spentMinor: { $sum: "$amountMinor" } } },
    ]).exec();
    return { spentMinor: rows[0]?.spentMinor ?? 0 };
  }

  return {
    create,
    findById,
    findActiveById,
    listByUser,
    findActiveDuplicate,
    update,
    softDelete,
    aggregateSpend,
  };
}

export const budgetRepository = createBudgetRepository();
