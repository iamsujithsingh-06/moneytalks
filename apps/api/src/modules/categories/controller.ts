import type { Request, Response } from "express";
import type {
  CategoryDeleteInput,
  CategoryListQuery,
  CategoryParams,
  CreateCategoryData,
  UpdateCategoryData,
} from "@moneytalks/types";
import type { CategoryService } from "./service.js";
import { notFound } from "../../lib/errors.js";
import { sendCreated, sendData, sendNoContent } from "../../lib/response.js";

export interface CategoriesController {
  create(req: Request, res: Response): Promise<Response>;
  list(req: Request, res: Response): Promise<Response>;
  getById(req: Request, res: Response): Promise<Response>;
  update(req: Request, res: Response): Promise<Response>;
  deleteById(req: Request, res: Response): Promise<Response>;
  restoreDefaults(req: Request, res: Response): Promise<Response>;
}

export function createCategoriesController(
  service: CategoryService,
): CategoriesController {
  return {
    async create(req, res) {
      const input = req.validatedBody as CreateCategoryData;
      const result = await service.create(input, {
        userId: req.auth!.userId,
      });
      return sendCreated(res, result, { requestId: req.requestId });
    },

    async list(req, res) {
      const query = req.validatedQuery as CategoryListQuery;
      const result = await service.list(req.auth!.userId, query);
      return sendData(res, result, { requestId: req.requestId });
    },

    async getById(req, res) {
      const params = req.validatedParams as CategoryParams;
      const result = await service.findById(req.auth!.userId, params.id);
      if (!result) {
        throw notFound("Category not found");
      }
      return sendData(res, result, { requestId: req.requestId });
    },

    async update(req, res) {
      const params = req.validatedParams as CategoryParams;
      const input = req.validatedBody as UpdateCategoryData;
      const result = await service.update(req.auth!.userId, params.id, input);
      return sendData(res, result, { requestId: req.requestId });
    },

    async deleteById(req, res) {
      const params = req.validatedParams as CategoryParams;
      const body = req.validatedBody as CategoryDeleteInput;
      await service.softDelete(
        req.auth!.userId,
        params.id,
        req.auth!.userId,
        body.reassignToId,
      );
      return sendNoContent(res);
    },

    async restoreDefaults(req, res) {
      const result = await service.restoreDefaults(req.auth!.userId);
      return sendData(res, result, { requestId: req.requestId });
    },
  };
}
