import type { Server } from "node:http";
import { disconnectDatabase } from "../db/index.js";
import type { AppLogger } from "./logger.js";

/**
 * Registers SIGTERM/SIGINT + process-level failure handlers and returns the
 * `shutdown` function so callers (and tests) can trigger a graceful stop.
 */
export function registerShutdownHooks(
  server: Server,
  logger: AppLogger,
): (signal: string) => void {
  let shuttingDown = false;

  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Graceful shutdown started");

    const forceExit = setTimeout(() => {
      logger.error("Graceful shutdown timed out, forcing exit");
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    server.close((err) => {
      if (err) {
        logger.error({ err: err.message }, "Error while closing HTTP server");
      } else {
        logger.info("HTTP server closed");
      }
      void disconnectDatabase()
        .then(() => {
          logger.info("Database connection closed");
        })
        .catch((dbErr: unknown) => {
          logger.error({
            err: dbErr instanceof Error ? dbErr.message : String(dbErr),
          }, "Error while closing database connection");
        })
        .finally(() => {
          logger.info("Shutdown complete");
          process.exit(0);
        });
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    logger.fatal({ err: String(reason) }, "Unhandled promise rejection");
    process.exit(1);
  });

  process.on("uncaughtException", (err) => {
    logger.fatal({ err: err.message, stack: err.stack }, "Uncaught exception");
    process.exit(1);
  });

  return shutdown;
}
