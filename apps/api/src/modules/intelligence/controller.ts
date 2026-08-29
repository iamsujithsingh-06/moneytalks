import type { Request, Response } from "express";
import type { AssistantQueryData } from "@moneytalks/validation";
import type { IntelligenceService } from "./service.js";
import { sendData } from "../../lib/response.js";

export interface IntelligenceController {
  report(req: Request, res: Response): Promise<Response>;
  assistant(req: Request, res: Response): Promise<Response>;
}

export function createIntelligenceController(
  service: IntelligenceService,
): IntelligenceController {
  return {
    async report(req, res) {
      // The report is computed from live user data; range is informational and
      // currently computed over the full confirmed history.
      const result = await service.report(req.auth!.userId);
      return sendData(res, result, { requestId: req.requestId });
    },

    async assistant(req, res) {
      const body = req.validatedBody as AssistantQueryData;
      const result = await service.assistant(req.auth!.userId, body.question);
      return sendData(res, result, { requestId: req.requestId });
    },
  };
}
