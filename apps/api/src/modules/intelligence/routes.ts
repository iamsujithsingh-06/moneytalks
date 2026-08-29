import { Router } from "express";
import {
  intelligenceQuerySchema,
  assistantQuerySchema,
} from "@moneytalks/validation";
import type { AppConfig } from "../../config/env.js";
import { requireAuth } from "../../middlewares/auth-guard.js";
import { validateQuery, validateBody } from "../../middlewares/validation.js";
import type { IntelligenceController } from "./controller.js";

export interface IntelligenceRouterDeps {
  controller: IntelligenceController;
  config: AppConfig;
}

export function createIntelligenceRouter(deps: IntelligenceRouterDeps): Router {
  const router = Router();

  router.get(
    "/report",
    requireAuth(deps.config),
    validateQuery(intelligenceQuerySchema),
    deps.controller.report,
  );

  router.post(
    "/assistant",
    requireAuth(deps.config),
    validateBody(assistantQuerySchema),
    deps.controller.assistant,
  );

  return router;
}
