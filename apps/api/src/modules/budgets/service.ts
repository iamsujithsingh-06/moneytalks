import {
  BudgetPeriod,
  BudgetScope,
  calculateBudgetPercent,
  deriveBudgetAlertStatus,
  resolveBudgetPeriodWindow,
  type BudgetAlertThresholds,
  type BudgetPeriodWindow,
} from "@moneytalks/shared";
import type {
  BudgetListQuery,
  BudgetPublic,
  CreateBudgetData,
  UpdateBudgetData,
} from "@moneytalks/types";
import { AppError, ErrorCodes, notFound } from "../../lib/errors.js";
import type { AppLogger } from "../../lib/logger.js";
import {
  budgetRepository,
  type AggregateBudgetSpendInput,
  type BudgetRecord,
  type BudgetRepository,
} from "./repository.js";

export interface BudgetServiceDeps {
  logger: AppLogger;
  repository?: BudgetRepository;
}

export interface BudgetContext {
  userId: string;
}

export interface BudgetSpend {
  spentMinor: number;
  percent: number;
  alertStatus: string;
}

function toBudgetPublic(record: BudgetRecord, spend: BudgetSpend): BudgetPublic {
  return {
    id: record.id,
    userId: record.userId,
    clientId: record.clientId,
    categoryId: record.categoryId,
    scope: record.scope,
    period: record.period,
    periodAnchor: record.periodAnchor
      ? record.periodAnchor.toISOString()
      : null,
    allocatedMinor: record.allocatedMinor,
    currency: record.currency,
    rollover: record.rollover,
    status: record.status,
    alertThresholds: {
      warningPct: record.alertThresholds.warningPct,
      hardPct: record.alertThresholds.hardPct,
    },
    spentMinor: spend.spentMinor,
    percent: spend.percent,
    alertStatus: spend.alertStatus,
    deleted: record.deletedAt !== null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    rev: record.rev,
  };
}

export class BudgetService {
  private readonly repository: BudgetRepository;

  constructor(private readonly deps: BudgetServiceDeps) {
    this.repository = deps.repository ?? budgetRepository;
  }

  async create(
    input: CreateBudgetData,
    ctx: BudgetContext,
  ): Promise<BudgetPublic> {
    const userId = ctx.userId;

    const existing = await this.repository.findActiveDuplicate(userId, {
      scope: input.scope,
      categoryId:
        input.scope === BudgetScope.Category ? input.categoryId : null,
      period: input.period,
    });
    if (existing) {
      throw this.budgetExists(input.scope);
    }

    try {
      const record = await this.repository.create({
        userId,
        clientId: input.clientId,
        categoryId:
          input.scope === BudgetScope.Category ? input.categoryId : null,
        scope: input.scope,
        period: input.period,
        periodAnchor: input.periodAnchor ?? null,
        allocatedMinor: input.allocatedMinor,
        currency: input.currency,
        rollover: input.rollover,
        status: input.status,
        alertThresholds: input.alertThresholds,
      });
      const spend = await this.computeSpend(record, new Date());
      return toBudgetPublic(record, spend);
    } catch (err) {
      if (!this.isDuplicateKeyError(err)) {
        throw err;
      }
      const raced = await this.repository.findActiveDuplicate(userId, {
        scope: input.scope,
        categoryId:
          input.scope === BudgetScope.Category ? input.categoryId : null,
        period: input.period,
      });
      if (raced) {
        throw this.budgetExists(input.scope);
      }
      throw new AppError(
        500,
        ErrorCodes.Internal,
        "Could not create the budget",
        { cause: err },
      );
    }
  }

  async list(
    userId: string,
    query: BudgetListQuery,
  ): Promise<BudgetPublic[]> {
    const records = await this.repository.listByUser(userId, {
      period: query.period,
    });
    const now = new Date();
    const budgets: BudgetPublic[] = [];
    for (const record of records) {
      const spend = await this.computeSpend(record, now);
      budgets.push(toBudgetPublic(record, spend));
    }
    return budgets;
  }

  async findById(userId: string, id: string): Promise<BudgetPublic | null> {
    const record = await this.repository.findActiveById(userId, id);
    if (!record) {
      return null;
    }
    const spend = await this.computeSpend(record, new Date());
    return toBudgetPublic(record, spend);
  }

  async update(
    userId: string,
    id: string,
    input: UpdateBudgetData,
  ): Promise<BudgetPublic> {
    const existing = await this.repository.findActiveById(userId, id);
    if (!existing) {
      throw notFound("Budget not found");
    }

    const next = this.mergeUpdate(existing, input);

    const duplicate = await this.repository.findActiveDuplicate(userId, {
      scope: next.scope,
      categoryId: next.categoryId,
      period: next.period,
    });
    if (duplicate && duplicate.id !== id) {
      throw this.budgetExists(next.scope);
    }

    try {
      const record = await this.repository.update(userId, id, {
        categoryId: input.categoryId,
        period: input.period,
        periodAnchor: input.periodAnchor,
        allocatedMinor: input.allocatedMinor,
        currency: input.currency,
        rollover: input.rollover,
        status: input.status,
        alertThresholds: input.alertThresholds,
      });
      if (!record) {
        throw notFound("Budget not found");
      }
      const spend = await this.computeSpend(record, new Date());
      return toBudgetPublic(record, spend);
    } catch (err) {
      if (!this.isDuplicateKeyError(err)) {
        throw err;
      }
      const raced = await this.repository.findActiveDuplicate(userId, {
        scope: next.scope,
        categoryId: next.categoryId,
        period: next.period,
      });
      if (raced && raced.id !== id) {
        throw this.budgetExists(next.scope);
      }
      throw new AppError(
        500,
        ErrorCodes.Internal,
        "Could not update the budget",
        { cause: err },
      );
    }
  }

  async softDelete(
    userId: string,
    budgetId: string,
    deletedBy: string,
  ): Promise<void> {
    const existing = await this.repository.findById(userId, budgetId);
    if (!existing) {
      throw notFound("Budget not found");
    }
    if (existing.deletedAt) {
      return;
    }
    await this.repository.softDelete(userId, budgetId, deletedBy);
  }

  private mergeUpdate(
    existing: BudgetRecord,
    input: UpdateBudgetData,
  ): { scope: string; categoryId: string | null; period: string } {
    return {
      scope: existing.scope,
      categoryId:
        input.categoryId === undefined ? existing.categoryId : input.categoryId,
      period: input.period ?? existing.period,
    };
  }

  private async computeSpend(
    record: BudgetRecord,
    now: Date,
  ): Promise<BudgetSpend> {
    const window = resolveBudgetPeriodWindow(
      record.period as BudgetPeriod,
      record.periodAnchor,
      now,
    );
    const spentMinor = await this.aggregateSpendForRecord(record, window);
    const percent = calculateBudgetPercent(
      record.allocatedMinor,
      spentMinor,
    );
    const thresholds: BudgetAlertThresholds = {
      warningPct: record.alertThresholds.warningPct,
      hardPct: record.alertThresholds.hardPct,
    };
    const alertStatus = deriveBudgetAlertStatus(percent, thresholds);
    return { spentMinor, percent, alertStatus };
  }

  private async aggregateSpendForRecord(
    record: BudgetRecord,
    window: BudgetPeriodWindow,
  ): Promise<number> {
    const input: AggregateBudgetSpendInput = {
      userId: record.userId,
      currency: record.currency,
      from: window.from,
      to: window.to,
    };
    if (record.scope === BudgetScope.Category && record.categoryId) {
      input.categoryId = record.categoryId;
    }
    const result = await this.repository.aggregateSpend(input);
    return result.spentMinor;
  }

  private budgetExists(scope: string): AppError {
    const label = scope === BudgetScope.Overall ? "overall" : "category";
    return new AppError(
      409,
      ErrorCodes.BudgetExists,
      `An active ${label} budget already exists for this period`,
    );
  }

  private isDuplicateKeyError(err: unknown): boolean {
    return (
      typeof err === "object" &&
      err !== null &&
      (err as { code?: number }).code === 11000
    );
  }
}
