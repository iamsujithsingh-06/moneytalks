import { Router } from "express";
import {
  budgetListQuerySchema,
  budgetParamsSchema,
  createBudgetSchema,
  updateBudgetSchema,
} from "@moneytalks/validation";
import type { AppConfig } from "../../config/env.js";
import { requireAuth } from "../../middlewares/auth-guard.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../middlewares/validation.js";
import type { BudgetsController } from "./controller.js";

export interface BudgetsRouterDeps {
  controller: BudgetsController;
  config: AppConfig;
}

export function createBudgetsRouter(deps: BudgetsRouterDeps): Router {
  const router = Router();

  router.get(
    "/",
    requireAuth(deps.config),
    validateQuery(budgetListQuerySchema),
    deps.controller.list,
  );

  router.post(
    "/",
    requireAuth(deps.config),
    validateBody(createBudgetSchema),
    deps.controller.create,
  );

  router.patch(
    "/:id",
    requireAuth(deps.config),
    validateParams(budgetParamsSchema),
    validateBody(updateBudgetSchema),
    deps.controller.update,
  );

  router.delete(
    "/:id",
    requireAuth(deps.config),
    validateParams(budgetParamsSchema),
    deps.controller.deleteById,
  );

  return router;
}
