import type { RequestHandler } from "express";
import type { AppConfig } from "../config/env.js";
import { AppError, ErrorCodes } from "../lib/errors.js";
import { verifyAccessToken } from "../lib/tokens.js";
import { UserModel, DeviceModel } from "../db/index.js";

/**
 * Protects routes behind a valid access token. Verifies the JWT statelessly,
 * then confirms the user still exists/active, the tokenVersion hasn't been
 * bumped (revocation events), and the issuing device isn't revoked.
 */
export function requireAuth(config: AppConfig): RequestHandler {
  return async (req, _res, next) => {
    try {
      const header = req.header("authorization") ?? "";
      const match = /^Bearer\s+(.+)$/i.exec(header);
      const token = match?.[1];
      if (!token) {
        throw new AppError(401, ErrorCodes.Unauthorized, "Authentication required");
      }

      const payload = await verifyAccessToken(config, token);
      const userId = payload.sub;

      const user = await UserModel.findById(userId).lean().exec();
      if (!user || user.status !== "active" || user.deletedAt) {
        throw new AppError(401, ErrorCodes.Unauthorized, "Session is no longer valid");
      }
      if (user.tokenVersion !== payload.tokenVersion) {
        throw new AppError(401, ErrorCodes.TokenRevoked, "Session has been revoked");
      }

      const device = await DeviceModel.findById(payload.deviceId).lean().exec();
      if (!device || device.userId.toString() !== userId) {
        throw new AppError(401, ErrorCodes.Unauthorized, "Session is no longer valid");
      }
      if (device.revokedAt) {
        throw new AppError(401, ErrorCodes.DeviceRevoked, "Session has been revoked");
      }

      req.auth = {
        userId,
        deviceId: payload.deviceId,
        tokenVersion: payload.tokenVersion,
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}
