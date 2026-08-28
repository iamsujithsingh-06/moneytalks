import { Router } from "express";
import type { AppConfig } from "../../config/env.js";
import { requireAuth } from "../../middlewares/auth-guard.js";
import type { DashboardController } from "./controller.js";

export interface DashboardRouterDeps {
  controller: DashboardController;
  config: AppConfig;
}

export function createDashboardRouter(deps: DashboardRouterDeps): Router {
  const router = Router();

  router.get("/summary", requireAuth(deps.config), deps.controller.summary);

  return router;
}
