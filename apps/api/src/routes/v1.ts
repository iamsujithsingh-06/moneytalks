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
import { createIntelligenceRouter } from "../modules/intelligence/routes.js";
import type { IntelligenceRouterDeps } from "../modules/intelligence/routes.js";
import { rateLimitByIp, type RateLimitDeps } from "../middlewares/rate-limit.js";

export interface V1RouterDeps {
  auth: AuthRouterDeps & { general: RateLimitDeps };
  transactions: TransactionsRouterDeps & { general: RateLimitDeps };
  categories: CategoriesRouterDeps & { general: RateLimitDeps };
  paymentMethods: PaymentMethodsRouterDeps & { general: RateLimitDeps };
  budgets: BudgetsRouterDeps & { general: RateLimitDeps };
  analytics: AnalyticsRouterDeps & { general: RateLimitDeps };
  dashboard: DashboardRouterDeps & { general: RateLimitDeps };
  sync: SyncRouterDeps & { general: RateLimitDeps };
  intelligence: IntelligenceRouterDeps & { general: RateLimitDeps };
}

export function createV1Router(deps: V1RouterDeps): Router {
  const router = Router();
  const throttle = rateLimitByIp(deps.auth.general);
  router.use("/auth", createAuthRouter(deps.auth));
  router.use("/transactions", throttle, createTransactionsRouter(deps.transactions));
  router.use("/categories", throttle, createCategoriesRouter(deps.categories));
  router.use(
    "/payment-methods",
    throttle,
    createPaymentMethodsRouter(deps.paymentMethods),
  );
  router.use("/budgets", throttle, createBudgetsRouter(deps.budgets));
  router.use("/analytics", throttle, createAnalyticsRouter(deps.analytics));
  router.use("/dashboard", throttle, createDashboardRouter(deps.dashboard));
  router.use("/sync", throttle, createSyncRouter(deps.sync));
  router.use("/intelligence", throttle, createIntelligenceRouter(deps.intelligence));
  return router;
}
