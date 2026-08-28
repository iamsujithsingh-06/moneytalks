import { createHash, randomBytes, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { AppConfig } from "../config/env.js";
import { AppError, ErrorCodes } from "./errors.js";

export const TOKEN_TYPE_ACCESS = "access" as const;

export interface AccessTokenPayload {
  sub: string;
  deviceId: string;
  jti: string;
  type: "access";
  tokenVersion: number;
  iat: number;
  exp: number;
}

export function createRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function signAccessToken(
  config: AppConfig,
  input: { userId: string; deviceId: string; tokenVersion: number },
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const jti = randomUUID();
  return new SignJWT({
    deviceId: input.deviceId,
    jti,
    type: TOKEN_TYPE_ACCESS,
    tokenVersion: input.tokenVersion,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(input.userId)
    .setIssuedAt(now)
    .setExpirationTime(now + config.jwt.accessTtlSeconds)
    .sign(config.jwt.secret);
}

export async function verifyAccessToken(
  config: AppConfig,
  token: string,
): Promise<AccessTokenPayload> {
  try {
    const { payload } = await jwtVerify(token, config.jwt.secret, {
      algorithms: ["HS256"],
      typ: "JWT",
    });
    if (payload.type !== TOKEN_TYPE_ACCESS) {
      throw new AppError(401, ErrorCodes.Unauthorized, "Invalid token");
    }
    const sub = payload.sub;
    const deviceId = payload.deviceId;
    const jti = payload.jti;
    const tokenVersion = payload.tokenVersion;
    if (
      typeof sub !== "string" ||
      typeof deviceId !== "string" ||
      typeof jti !== "string" ||
      typeof tokenVersion !== "number"
    ) {
      throw new AppError(401, ErrorCodes.Unauthorized, "Invalid token");
    }
    return {
      sub,
      deviceId,
      jti,
      type: TOKEN_TYPE_ACCESS,
      tokenVersion,
      iat: payload.iat ?? 0,
      exp: payload.exp ?? 0,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err instanceof Error && err.name === "JWTExpired") {
      throw new AppError(401, ErrorCodes.TokenExpired, "Token has expired");
    }
    throw new AppError(401, ErrorCodes.Unauthorized, "Invalid or expired token");
  }
}

export function refreshTokenExpiry(
  config: AppConfig,
  now: Date = new Date(),
): Date {
  const ms = config.refreshTokenTtlDays * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() + ms);
}
