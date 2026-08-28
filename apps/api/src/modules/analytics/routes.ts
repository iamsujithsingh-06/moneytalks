import { Router } from "express";
import {
  analyticsCashflowQuerySchema,
  analyticsCategoriesQuerySchema,
  analyticsSummaryQuerySchema,
} from "@moneytalks/validation";
import type { AppConfig } from "../../config/env.js";
import { requireAuth } from "../../middlewares/auth-guard.js";
import { validateQuery } from "../../middlewares/validation.js";
import type { AnalyticsController } from "./controller.js";

export interface AnalyticsRouterDeps {
  controller: AnalyticsController;
  config: AppConfig;
}

export function createAnalyticsRouter(deps: AnalyticsRouterDeps): Router {
  const router = Router();

  router.get(
    "/summary",
    requireAuth(deps.config),
    validateQuery(analyticsSummaryQuerySchema),
    deps.controller.summary,
  );

  router.get(
    "/cashflow",
    requireAuth(deps.config),
    validateQuery(analyticsCashflowQuerySchema),
    deps.controller.cashFlow,
  );

  router.get(
    "/categories",
    requireAuth(deps.config),
    validateQuery(analyticsCategoriesQuerySchema),
    deps.controller.categories,
  );

  return router;
}
