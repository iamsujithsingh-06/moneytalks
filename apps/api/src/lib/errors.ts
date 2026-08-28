export interface AppErrorOptions {
  details?: unknown[];
  retryable?: boolean;
  retryAfterSeconds?: number | null;
  cause?: unknown;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown[];
  public readonly retryable: boolean;
  public readonly retryAfterSeconds: number | null;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    options: AppErrorOptions = {},
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = options.details;
    this.retryable = options.retryable ?? false;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export const ErrorCodes = {
  Validation: "VALIDATION_ERROR",
  Unauthorized: "UNAUTHORIZED",
  TokenExpired: "TOKEN_EXPIRED",
  TokenRevoked: "TOKEN_REVOKED",
  DeviceRevoked: "DEVICE_REVOKED",
  RefreshReuse: "REFRESH_REUSE",
  Forbidden: "FORBIDDEN",
  AccountLocked: "ACCOUNT_LOCKED",
  AccountDisabled: "ACCOUNT_DISABLED",
  NotFound: "NOT_FOUND",
  EmailExists: "EMAIL_EXISTS",
  DuplicateTransaction: "DUPLICATE_TRANSACTION",
  CategoryExists: "CATEGORY_EXISTS",
  CategoryInUse: "CATEGORY_IN_USE",
  PaymentMethodExists: "PAYMENT_METHOD_EXISTS",
  BudgetExists: "BUDGET_EXISTS",
  RateLimited: "RATE_LIMITED",
  PayloadTooLarge: "PAYLOAD_TOO_LARGE",
  UnsupportedMedia: "UNSUPPORTED_MEDIA_TYPE",
  ResourceExpired: "RESOURCE_EXPIRED",
  Internal: "INTERNAL_ERROR",
  BadRequest: "BAD_REQUEST",
} as const;

export function validationError(message: string, details: unknown[]) {
  return new AppError(422, ErrorCodes.Validation, message, { details });
}

export function unauthorized(message = "Authentication required") {
  return new AppError(401, ErrorCodes.Unauthorized, message);
}

export function forbidden(message = "You do not have permission to do this") {
  return new AppError(403, ErrorCodes.Forbidden, message);
}

export function notFound(message = "Resource not found") {
  return new AppError(404, ErrorCodes.NotFound, message);
}

export function internalError(cause: unknown, message = "Internal server error") {
  return new AppError(500, ErrorCodes.Internal, message, {
    retryable: true,
    cause,
  });
}
