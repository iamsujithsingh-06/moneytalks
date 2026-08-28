import cors from "cors";
import type { RequestHandler } from "express";
import type { AppConfig } from "../config/env.js";
import { AppError, ErrorCodes } from "../lib/errors.js";

/**
 * CORS locked to the registered origin allowlist (no wildcards).
 * Requests without an Origin header (curl, server-to-server, same-origin)
 * are always allowed; browsers are constrained by the allowlist.
 */
export function createCors(config: AppConfig): RequestHandler {
  return cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (config.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new AppError(403, ErrorCodes.Forbidden, "Origin not allowed by CORS"));
    },
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Idempotency-Key",
      "X-Request-Id",
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    maxAge: 86400,
  });
}
