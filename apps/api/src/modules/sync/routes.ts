import { Router } from "express";
import {
  syncChangesQuerySchema,
  syncPushBodySchema,
} from "@moneytalks/validation";
import type { AppConfig } from "../../config/env.js";
import { requireAuth } from "../../middlewares/auth-guard.js";
import { validateBody, validateQuery } from "../../middlewares/validation.js";
import type { SyncController } from "./controller.js";

export interface SyncRouterDeps {
  controller: SyncController;
  config: AppConfig;
}

export function createSyncRouter(deps: SyncRouterDeps): Router {
  const router = Router();

  router.get(
    "/changes",
    requireAuth(deps.config),
    validateQuery(syncChangesQuerySchema),
    deps.controller.changes,
  );

  router.post(
    "/push",
    requireAuth(deps.config),
    validateBody(syncPushBodySchema),
    deps.controller.push,
  );

  router.get("/state", requireAuth(deps.config), deps.controller.state);

  router.get("/bootstrap", requireAuth(deps.config), deps.controller.bootstrap);

  return router;
}
