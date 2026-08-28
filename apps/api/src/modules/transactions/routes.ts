import { Router } from "express";
import {
  createTransactionSchema,
  transactionListQuerySchema,
  transactionParamsSchema,
  updateTransactionSchema,
} from "@moneytalks/validation";
import type { AppConfig } from "../../config/env.js";
import { requireAuth } from "../../middlewares/auth-guard.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../middlewares/validation.js";
import type { TransactionsController } from "./controller.js";

export interface TransactionsRouterDeps {
  controller: TransactionsController;
  config: AppConfig;
}

export function createTransactionsRouter(deps: TransactionsRouterDeps): Router {
  const router = Router();

  router.post(
    "/",
    requireAuth(deps.config),
    validateBody(createTransactionSchema),
    deps.controller.create,
  );

  router.get(
    "/",
    requireAuth(deps.config),
    validateQuery(transactionListQuerySchema),
    deps.controller.list,
  );

  router.get(
    "/:id",
    requireAuth(deps.config),
    validateParams(transactionParamsSchema),
    deps.controller.getById,
  );

  router.patch(
    "/:id",
    requireAuth(deps.config),
    validateParams(transactionParamsSchema),
    validateBody(updateTransactionSchema),
    deps.controller.update,
  );

  router.delete(
    "/:id",
    requireAuth(deps.config),
    validateParams(transactionParamsSchema),
    deps.controller.deleteById,
  );

  return router;
}
