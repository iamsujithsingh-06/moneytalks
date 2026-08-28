import type { Request, Response } from "express";
import type {
  CreateTransactionData,
  TransactionListQuery,
  TransactionParams,
  TransactionUpdateRequest,
} from "@moneytalks/types";
import type { TransactionService } from "./service.js";
import { notFound } from "../../lib/errors.js";
import { sendCreated, sendData, sendNoContent } from "../../lib/response.js";

export interface TransactionsController {
  create(req: Request, res: Response): Promise<Response>;
  list(req: Request, res: Response): Promise<Response>;
  getById(req: Request, res: Response): Promise<Response>;
  update(req: Request, res: Response): Promise<Response>;
  deleteById(req: Request, res: Response): Promise<Response>;
}

export function createTransactionsController(
  service: TransactionService,
): TransactionsController {
  return {
    async create(req, res) {
      const input = req.validatedBody as CreateTransactionData;
      const result = await service.create(input, {
        userId: req.auth!.userId,
      });
      return sendCreated(res, result, { requestId: req.requestId });
    },

    async list(req, res) {
      const query = req.validatedQuery as TransactionListQuery;
      const result = await service.list(req.auth!.userId, query);
      return sendData(res, result.items, {
        requestId: req.requestId,
        nextCursor: result.nextCursor,
        total: result.total,
      });
    },

    async getById(req, res) {
      const params = req.validatedParams as TransactionParams;
      const result = await service.findById(req.auth!.userId, params.id);
      if (!result) {
        throw notFound("Transaction not found");
      }
      return sendData(res, result, { requestId: req.requestId });
    },

    async update(req, res) {
      const params = req.validatedParams as TransactionParams;
      const input = req.validatedBody as TransactionUpdateRequest;
      const result = await service.update(req.auth!.userId, params.id, input);
      return sendData(res, result, { requestId: req.requestId });
    },

    async deleteById(req, res) {
      const params = req.validatedParams as TransactionParams;
      await service.softDelete(req.auth!.userId, params.id);
      return sendNoContent(res);
    },
  };
}
