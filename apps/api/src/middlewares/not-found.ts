import type { RequestHandler } from "express";
import { notFound } from "../lib/errors.js";

export function notFoundHandler(): RequestHandler {
  return (_req, _res, next) => {
    next(notFound("Endpoint not found"));
  };
}
