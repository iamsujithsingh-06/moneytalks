import type { Response } from "express";

interface ResponseMeta {
  requestId?: string;
  [key: string]: unknown;
}

function buildEnvelope(res: Response, data: unknown, meta: ResponseMeta) {
  const requestId = meta.requestId ?? res.req.requestId ?? "unknown";
  const { requestId: _rid, ...restMeta } = meta;
  return { data, meta: { requestId, ...restMeta } };
}

export function sendData(
  res: Response,
  data: unknown,
  meta: ResponseMeta = {},
): Response {
  return res.status(200).json(buildEnvelope(res, data, meta));
}

export function sendCreated(
  res: Response,
  data: unknown,
  meta: ResponseMeta = {},
): Response {
  return res.status(201).json(buildEnvelope(res, data, meta));
}

export function sendNoContent(res: Response): Response {
  return res.status(204).end();
}
