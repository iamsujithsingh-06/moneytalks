import type { Request, Response } from "express";
import type { SyncChangesQueryData, SyncPushBodyData } from "@moneytalks/validation";
import type { SyncService } from "./service.js";
import { sendData } from "../../lib/response.js";

export interface SyncController {
  changes(req: Request, res: Response): Promise<Response>;
  push(req: Request, res: Response): Promise<Response>;
  state(req: Request, res: Response): Promise<Response>;
  bootstrap(req: Request, res: Response): Promise<Response>;
}

export function createSyncController(service: SyncService): SyncController {
  return {
    async changes(req, res) {
      const query = req.validatedQuery as SyncChangesQueryData;
      const result = await service.changes(
        { userId: req.auth!.userId, deviceId: req.auth!.deviceId },
        query,
      );
      return sendData(res, result, { requestId: req.requestId });
    },

    async push(req, res) {
      const body = req.validatedBody as SyncPushBodyData;
      const result = await service.push(
        { userId: req.auth!.userId, deviceId: req.auth!.deviceId },
        body.ops,
      );
      return sendData(res, result, { requestId: req.requestId });
    },

    async state(req, res) {
      const result = await service.state({
        userId: req.auth!.userId,
        deviceId: req.auth!.deviceId,
      });
      return sendData(res, result, { requestId: req.requestId });
    },

    async bootstrap(req, res) {
      const result = await service.bootstrap({
        userId: req.auth!.userId,
        deviceId: req.auth!.deviceId,
      });
      return sendData(res, result, { requestId: req.requestId });
    },
  };
}
