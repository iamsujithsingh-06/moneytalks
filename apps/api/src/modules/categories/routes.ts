import { Router } from "express";
import {
  categoryDeleteSchema,
  categoryListQuerySchema,
  categoryParamsSchema,
  createCategorySchema,
  updateCategorySchema,
} from "@moneytalks/validation";
import type { AppConfig } from "../../config/env.js";
import { requireAuth } from "../../middlewares/auth-guard.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../middlewares/validation.js";
import type { CategoriesController } from "./controller.js";

export interface CategoriesRouterDeps {
  controller: CategoriesController;
  config: AppConfig;
}

export function createCategoriesRouter(deps: CategoriesRouterDeps): Router {
  const router = Router();

  router.get(
    "/",
    requireAuth(deps.config),
    validateQuery(categoryListQuerySchema),
    deps.controller.list,
  );

  router.post(
    "/",
    requireAuth(deps.config),
    validateBody(createCategorySchema),
    deps.controller.create,
  );

  router.post(
    "/defaults",
    requireAuth(deps.config),
    deps.controller.restoreDefaults,
  );

  router.get(
    "/:id",
    requireAuth(deps.config),
    validateParams(categoryParamsSchema),
    deps.controller.getById,
  );

  router.patch(
    "/:id",
    requireAuth(deps.config),
    validateParams(categoryParamsSchema),
    validateBody(updateCategorySchema),
    deps.controller.update,
  );

  router.delete(
    "/:id",
    requireAuth(deps.config),
    validateParams(categoryParamsSchema),
    validateBody(categoryDeleteSchema),
    deps.controller.deleteById,
  );

  return router;
}
