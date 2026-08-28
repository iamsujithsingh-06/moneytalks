import type { ErrorRequestHandler } from "express";
import type { AppLogger } from "../lib/logger.js";
import { AppError, ErrorCodes } from "../lib/errors.js";

interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    details?: unknown[];
    retryable: boolean;
    retryAfterSeconds: number | null;
    requestId: string;
  };
}

function isZodError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: string }).name === "ZodError" &&
    Array.isArray((err as { issues?: unknown[] }).issues)
  );
}

function isMongooseCastError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: string }).name === "CastError"
  );
}

function isMongooseValidationError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: string }).name === "ValidationError"
  );
}

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: number }).code === 11000
  );
}

function isPayloadTooLarge(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { type?: string }).type === "entity.too.large"
  );
}

function isBodyParseError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { type?: string }).type === "entity.parse.failed"
  );
}

export function errorHandler(logger: AppLogger): ErrorRequestHandler {
  return (err: unknown, req, res, _next) => {
    const requestId =
      typeof req.requestId === "string" ? req.requestId : "unknown";

    let statusCode = 500;
    let code: string = ErrorCodes.Internal;
    let message = "An unexpected error occurred";
    let details: unknown[] | undefined;
    let retryable = false;
    let retryAfterSeconds: number | null = null;

    if (err instanceof AppError) {
      statusCode = err.statusCode;
      code = err.code;
      message = err.message;
      details = err.details;
      retryable = err.retryable;
      retryAfterSeconds = err.retryAfterSeconds;
    } else if (isZodError(err)) {
      statusCode = 422;
      code = ErrorCodes.Validation;
      message = "Request is invalid";
      details = (err as { issues: unknown[] }).issues;
    } else if (isPayloadTooLarge(err)) {
      statusCode = 413;
      code = ErrorCodes.PayloadTooLarge;
      message = "Request payload is too large";
      retryable = false;
    } else if (isBodyParseError(err)) {
      statusCode = 400;
      code = ErrorCodes.BadRequest;
      message = "Request body is not valid JSON";
    } else if (isMongooseCastError(err) || isMongooseValidationError(err)) {
      statusCode = 422;
      code = ErrorCodes.Validation;
      message = "Request is invalid";
      retryable = false;
    } else if (isDuplicateKeyError(err)) {
      statusCode = 409;
      code = "RESOURCE_CONFLICT";
      message = "A resource with these values already exists";
    } else {
      logger.error({
        event: "unhandled_error",
        requestId,
        method: req.method,
        path: req.path,
        err: err instanceof Error ? err.message : String(err),
      });
    }

    if (statusCode >= 500) {
      logger.error({
        event: "error_response",
        requestId,
        statusCode,
        code,
        err: err instanceof Error ? err.message : String(err),
      });
    }

    if (retryAfterSeconds != null) {
      res.setHeader("Retry-After", String(retryAfterSeconds));
    }

    const body: ErrorResponseBody = {
      error: {
        code,
        message,
        ...(details ? { details } : {}),
        retryable,
        retryAfterSeconds,
        requestId,
      },
    };

    res.status(statusCode).json(body);
  };
}
