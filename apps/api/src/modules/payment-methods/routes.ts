import { Router } from "express";
import {
  createPaymentMethodSchema,
  paymentMethodListQuerySchema,
  paymentMethodParamsSchema,
  updatePaymentMethodSchema,
} from "@moneytalks/validation";
import type { AppConfig } from "../../config/env.js";
import { requireAuth } from "../../middlewares/auth-guard.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../middlewares/validation.js";
import type { PaymentMethodsController } from "./controller.js";

export interface PaymentMethodsRouterDeps {
  controller: PaymentMethodsController;
  config: AppConfig;
}

export function createPaymentMethodsRouter(
  deps: PaymentMethodsRouterDeps,
): Router {
  const router = Router();

  router.get(
    "/",
    requireAuth(deps.config),
    validateQuery(paymentMethodListQuerySchema),
    deps.controller.list,
  );

  router.post(
    "/",
    requireAuth(deps.config),
    validateBody(createPaymentMethodSchema),
    deps.controller.create,
  );

  router.patch(
    "/:id",
    requireAuth(deps.config),
    validateParams(paymentMethodParamsSchema),
    validateBody(updatePaymentMethodSchema),
    deps.controller.update,
  );

  router.delete(
    "/:id",
    requireAuth(deps.config),
    validateParams(paymentMethodParamsSchema),
    deps.controller.deleteById,
  );

  return router;
}
