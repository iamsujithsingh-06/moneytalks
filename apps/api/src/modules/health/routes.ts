import { Router } from "express";
import { isDbConnected } from "../../db/index.js";

export function createHealthRouter(): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    const databaseUp = isDbConnected();
    const status = databaseUp ? "ok" : "degraded";
    res.status(databaseUp ? 200 : 503).json({
      status,
      checks: {
        database: databaseUp ? "up" : "down",
      },
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
