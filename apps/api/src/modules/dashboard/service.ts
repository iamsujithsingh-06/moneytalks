import { BudgetPeriod, resolveBudgetPeriodWindow } from "@moneytalks/shared";
import type { DashboardSummary } from "@moneytalks/types";
import type { AppLogger } from "../../lib/logger.js";
import type { AnalyticsService } from "../analytics/service.js";
import type { BudgetService } from "../budgets/service.js";
import type { TransactionService } from "../transactions/service.js";

export interface DashboardServiceDeps {
  logger: AppLogger;
  analyticsService: AnalyticsService;
  budgetService: BudgetService;
  transactionService: TransactionService;
}

export class DashboardService {
  constructor(private readonly deps: DashboardServiceDeps) {}

  async summary(userId: string): Promise<DashboardSummary> {
    const now = new Date();
    const monthWindow = resolveBudgetPeriodWindow(
      BudgetPeriod.Monthly,
      null,
      now,
    );

    const [balance, monthTotals, topCategories, budgets, recentResult] =
      await Promise.all([
        this.deps.analyticsService.balance(userId),
        this.deps.analyticsService.totals(userId, monthWindow),
        this.deps.analyticsService.topCategories(userId, undefined, undefined, 5),
        this.deps.budgetService.list(userId, {}),
        this.deps.transactionService.list(userId, { limit: 5 }),
      ]);

    const monthIncome = monthTotals.income;
    const monthExpense = monthTotals.expense;

    return {
      balance,
      monthIncome,
      monthExpense,
      net: monthIncome - monthExpense,
      topCategories,
      recent: recentResult.items,
      budgets,
      goals: [],
      insights: [],
    };
  }
}
