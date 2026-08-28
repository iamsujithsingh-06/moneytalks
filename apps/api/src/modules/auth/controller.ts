import type { Request, Response } from "express";
import type {
  LoginRequest,
  LogoutRequest,
  RefreshRequest,
  RegisterRequest,
} from "@moneytalks/types";
import type { AuthService } from "./service.js";
import { sendCreated, sendData, sendNoContent } from "../../lib/response.js";

function ctxFrom(req: Request) {
  return {
    ip: req.ip ?? req.socket.remoteAddress,
    userAgent: req.header("user-agent"),
    requestId:
      typeof req.requestId === "string" ? req.requestId : undefined,
  };
}

export interface AuthController {
  register(req: Request, res: Response): Promise<Response>;
  login(req: Request, res: Response): Promise<Response>;
  refresh(req: Request, res: Response): Promise<Response>;
  logout(req: Request, res: Response): Promise<Response>;
  logoutAll(req: Request, res: Response): Promise<Response>;
  me(req: Request, res: Response): Promise<Response>;
}

export function createAuthController(service: AuthService): AuthController {
  return {
    async register(req, res) {
      const input = req.validatedBody as RegisterRequest;
      const result = await service.register(input, ctxFrom(req));
      return sendCreated(
        res,
        { userId: result.userId, emailVerified: false },
        { requestId: req.requestId },
      );
    },

    async login(req, res) {
      const input = req.validatedBody as LoginRequest;
      const result = await service.login(input, ctxFrom(req));
      return sendData(res, result, { requestId: req.requestId });
    },

    async refresh(req, res) {
      const input = req.validatedBody as RefreshRequest;
      const result = await service.refresh(input.refreshToken, ctxFrom(req));
      return sendData(res, result, { requestId: req.requestId });
    },

    async logout(req, res) {
      const input = req.validatedBody as LogoutRequest;
      await service.logout(input.deviceId, req.auth!.userId, ctxFrom(req));
      return sendNoContent(res);
    },

    async logoutAll(req, res) {
      await service.logoutAll(req.auth!.userId, ctxFrom(req));
      return sendNoContent(res);
    },

    async me(req, res) {
      const user = await service.me(req.auth!.userId);
      return sendData(res, { user }, { requestId: req.requestId });
    },
  };
}
