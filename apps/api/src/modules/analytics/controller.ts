import type { Request, Response } from "express";
import type {
  AnalyticsCashflowQuery,
  AnalyticsCategoriesQuery,
  AnalyticsSummaryQuery,
} from "@moneytalks/types";
import type { AnalyticsService } from "./service.js";
import { sendData } from "../../lib/response.js";

export interface AnalyticsController {
  summary(req: Request, res: Response): Promise<Response>;
  cashFlow(req: Request, res: Response): Promise<Response>;
  categories(req: Request, res: Response): Promise<Response>;
}

export function createAnalyticsController(
  service: AnalyticsService,
): AnalyticsController {
  return {
    async summary(req, res) {
      const query = req.validatedQuery as AnalyticsSummaryQuery;
      const result = await service.summary(req.auth!.userId, query);
      return sendData(res, result, { requestId: req.requestId });
    },

    async cashFlow(req, res) {
      const query = req.validatedQuery as AnalyticsCashflowQuery;
      const result = await service.cashFlow(req.auth!.userId, query);
      return sendData(res, result, { requestId: req.requestId });
    },

    async categories(req, res) {
      const query = req.validatedQuery as AnalyticsCategoriesQuery;
      const result = await service.categories(req.auth!.userId, query);
      return sendData(res, result, { requestId: req.requestId });
    },
  };
}
