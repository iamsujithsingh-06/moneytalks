import type { Request, Response } from "express";
import type { DashboardService } from "./service.js";
import { sendData } from "../../lib/response.js";

export interface DashboardController {
  summary(req: Request, res: Response): Promise<Response>;
}

export function createDashboardController(
  service: DashboardService,
): DashboardController {
  return {
    async summary(req, res) {
      const result = await service.summary(req.auth!.userId);
      return sendData(res, result, { requestId: req.requestId });
    },
  };
}
