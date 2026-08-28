import pino from "pino";
import { pinoHttp } from "pino-http";
import type { IncomingMessage } from "node:http";
import type { AppConfig } from "../config/env.js";

const redactPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers['set-cookie']",
];

export function createLogger(config: AppConfig) {
  const logger = pino({
    name: "moneytalks-api",
    level: config.logLevel,
    base: { service: "api" },
    redact: { paths: redactPaths, censor: "[REDACTED]" },
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });

  if (!config.jwt.secretProvided && !config.isProduction) {
    logger.warn(
      "JWT_SECRET not provided - using an insecure development fallback. Set JWT_SECRET in production.",
    );
  }

  return logger;
}

export type AppLogger = ReturnType<typeof createLogger>;

/**
 * Request logger. pino-http uses the existing req.id (set by the request-id
 * middleware) when present, so requestId correlation holds end-to-end.
 */
export function createHttpLogger(logger: AppLogger) {
  return pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => req.url?.startsWith("/health") ?? false,
    },
    customProps: (req: IncomingMessage) => {
      const typed = req as IncomingMessage & { auth?: { userId?: string } };
      return typed.auth?.userId ? { userId: typed.auth.userId } : {};
    },
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url,
          remoteAddress: req.remoteAddress,
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  });
}
