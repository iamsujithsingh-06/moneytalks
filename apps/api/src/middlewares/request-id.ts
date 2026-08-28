import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

const VALID_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requestId(): RequestHandler {
  return (req, res, next) => {
    const incoming = req.header("x-request-id");
    const id =
      incoming && VALID_UUID.test(incoming.trim())
        ? incoming.trim()
        : randomUUID();
    req.requestId = id;
    // Keep pino-http correlation in sync (it derives request ids from req.id).
    (req as { id?: string }).id = id;
    res.setHeader("X-Request-Id", id);
    next();
  };
}
