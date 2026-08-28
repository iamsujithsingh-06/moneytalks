import type { RequestHandler } from "express";
import type { z } from "zod";
import { formatZodError } from "@moneytalks/validation";
import { validationError } from "../lib/errors.js";

export function validateBody(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(
        validationError(
          "Request body is invalid",
          formatZodError(result.error),
        ),
      );
      return;
    }
    req.validatedBody = result.data;
    next();
  };
}

export function validateQuery(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(
        validationError(
          "Query parameters are invalid",
          formatZodError(result.error),
        ),
      );
      return;
    }
    req.validatedQuery = result.data;
    next();
  };
}

export function validateParams(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      next(
        validationError(
          "URL parameters are invalid",
          formatZodError(result.error),
        ),
      );
      return;
    }
    req.validatedParams = result.data;
    next();
  };
}
