import type { Request, Response } from "express";
import type {
  CreatePaymentMethodData,
  PaymentMethodListQuery,
  PaymentMethodParams,
  UpdatePaymentMethodData,
} from "@moneytalks/types";
import type { PaymentMethodService } from "./service.js";
import { sendCreated, sendData, sendNoContent } from "../../lib/response.js";

export interface PaymentMethodsController {
  create(req: Request, res: Response): Promise<Response>;
  list(req: Request, res: Response): Promise<Response>;
  update(req: Request, res: Response): Promise<Response>;
  deleteById(req: Request, res: Response): Promise<Response>;
}

export function createPaymentMethodsController(
  service: PaymentMethodService,
): PaymentMethodsController {
  return {
    async create(req, res) {
      const input = req.validatedBody as CreatePaymentMethodData;
      const result = await service.create(input, {
        userId: req.auth!.userId,
      });
      return sendCreated(res, result, { requestId: req.requestId });
    },

    async list(req, res) {
      const query = req.validatedQuery as PaymentMethodListQuery;
      const result = await service.list(req.auth!.userId, query);
      return sendData(res, result, { requestId: req.requestId });
    },

    async update(req, res) {
      const params = req.validatedParams as PaymentMethodParams;
      const input = req.validatedBody as UpdatePaymentMethodData;
      const result = await service.update(req.auth!.userId, params.id, input);
      return sendData(res, result, { requestId: req.requestId });
    },

    async deleteById(req, res) {
      const params = req.validatedParams as PaymentMethodParams;
      await service.softDelete(req.auth!.userId, params.id, req.auth!.userId);
      return sendNoContent(res);
    },
  };
}
