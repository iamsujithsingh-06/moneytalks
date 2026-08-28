import { Router } from "express";
import { createAuthRouter } from "../modules/auth/routes.js";
import type { AuthRouterDeps } from "../modules/auth/routes.js";
import { createTransactionsRouter } from "../modules/transactions/routes.js";
import type { TransactionsRouterDeps } from "../modules/transactions/routes.js";
import { createCategoriesRouter } from "../modules/categories/routes.js";
import type { CategoriesRouterDeps } from "../modules/categories/routes.js";
import { createPaymentMethodsRouter } from "../modules/payment-methods/routes.js";
import type { PaymentMethodsRouterDeps } from "../modules/payment-methods/routes.js";
import { createBudgetsRouter } from "../modules/budgets/routes.js";
import type { BudgetsRouterDeps } from "../modules/budgets/routes.js";
import { createAnalyticsRouter } from "../modules/analytics/routes.js";
import type { AnalyticsRouterDeps } from "../modules/analytics/routes.js";
import { createDashboardRouter } from "../modules/dashboard/routes.js";
import type { DashboardRouterDeps } from "../modules/dashboard/routes.js";
import { createSyncRouter } from "../modules/sync/routes.js";
import type { SyncRouterDeps } from "../modules/sync/routes.js";

export interface V1RouterDeps {
  auth: AuthRouterDeps;
  transactions: TransactionsRouterDeps;
  categories: CategoriesRouterDeps;
  paymentMethods: PaymentMethodsRouterDeps;
  budgets: BudgetsRouterDeps;
  analytics: AnalyticsRouterDeps;
  dashboard: DashboardRouterDeps;
  sync: SyncRouterDeps;
}

export function createV1Router(deps: V1RouterDeps): Router {
  const router = Router();
  router.use("/auth", createAuthRouter(deps.auth));
  router.use("/transactions", createTransactionsRouter(deps.transactions));
  router.use("/categories", createCategoriesRouter(deps.categories));
  router.use(
    "/payment-methods",
    createPaymentMethodsRouter(deps.paymentMethods),
  );
  router.use("/budgets", createBudgetsRouter(deps.budgets));
  router.use("/analytics", createAnalyticsRouter(deps.analytics));
  router.use("/dashboard", createDashboardRouter(deps.dashboard));
  router.use("/sync", createSyncRouter(deps.sync));
  return router;
}
