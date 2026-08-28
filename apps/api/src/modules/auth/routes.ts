import { Router } from "express";
import { registerSchema, loginSchema, refreshSchema, logoutSchema } from "@moneytalks/validation";
import type { AppConfig } from "../../config/env.js";
import { requireAuth } from "../../middlewares/auth-guard.js";
import { validateBody } from "../../middlewares/validation.js";
import { rateLimitByIp, type RateLimitDeps } from "../../middlewares/rate-limit.js";
import type { AuthController } from "./controller.js";

export interface AuthRouterDeps {
  controller: AuthController;
  config: AppConfig;
  rateLimiters: { auth: RateLimitDeps; register: RateLimitDeps };
}

export function createAuthRouter(deps: AuthRouterDeps): Router {
  const router = Router();
  const auth = deps.config;

  router.post(
    "/register",
    rateLimitByIp(deps.rateLimiters.register),
    validateBody(registerSchema),
    deps.controller.register,
  );

  router.post(
    "/login",
    rateLimitByIp(deps.rateLimiters.auth),
    validateBody(loginSchema),
    deps.controller.login,
  );

  router.post(
    "/refresh",
    rateLimitByIp(deps.rateLimiters.auth),
    validateBody(refreshSchema),
    deps.controller.refresh,
  );

  router.post(
    "/logout",
    requireAuth(auth),
    validateBody(logoutSchema),
    deps.controller.logout,
  );

  router.post("/logout-all", requireAuth(auth), deps.controller.logoutAll);

  router.get("/me", requireAuth(auth), deps.controller.me);

  return router;
}
