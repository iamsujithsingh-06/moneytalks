import { Types } from "mongoose";
import { createHash, randomUUID } from "node:crypto";
import type { AppConfig } from "../../config/env.js";
import type { AppLogger } from "../../lib/logger.js";
import { AppError, ErrorCodes } from "../../lib/errors.js";
import { hashPassword, passwordNeedsRehash, verifyPassword } from "../../lib/password.js";
import {
  createRefreshToken,
  hashToken,
  refreshTokenExpiry,
  signAccessToken,
} from "../../lib/tokens.js";
import { SlidingWindowRateLimiter, assertRateLimit } from "../../lib/rate-limiter.js";
import type { LoginRequest, RegisterRequest, UserPublic } from "@moneytalks/types";
import { authRepository, type CreateDeviceInput } from "./repository.js";
import type { CategoryService } from "../categories/service.js";

export interface AuthServiceDeps {
  config: AppConfig;
  logger: AppLogger;
  accountRateLimiter: SlidingWindowRateLimiter;
  categoryService: CategoryService;
}

export interface RequestContext {
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  deviceId: string;
  user: UserPublic;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

function toUserPublic(doc: {
  _id: Types.ObjectId;
  email: string;
  name: string | null;
  status: string;
  emailVerifiedAt: Date | null;
  defaultCurrency: string;
  createdAt: Date;
}): UserPublic {
  return {
    id: doc._id.toString(),
    email: doc.email,
    name: doc.name,
    status: doc.status,
    emailVerified: doc.emailVerifiedAt !== null,
    defaultCurrency: doc.defaultCurrency,
    createdAt: doc.createdAt.toISOString(),
  };
}

function normalizeDevice(input?: {
  name?: string;
  platform?: "web" | "android";
  fingerprint?: string;
}) {
  return {
    name: input?.name ?? "",
    platform: input?.platform ?? "web",
    fingerprint: input?.fingerprint ?? "",
  };
}

export class AuthService {
  constructor(private readonly deps: AuthServiceDeps) {}

  async register(input: RegisterRequest, ctx: RequestContext): Promise<{ userId: string }> {
    const email = input.email.toLowerCase();
    const existing = await authRepository.findUserByEmail(email);
    if (existing) {
      throw new AppError(409, ErrorCodes.EmailExists, "An account with this email already exists");
    }

    const passwordHash = await hashPassword(input.password);
    let user;
    try {
      user = await authRepository.createUser({
        email,
        passwordHash,
        name: input.name ?? null,
      });
    } catch (err) {
      if (this.isDuplicateKeyError(err)) {
        throw new AppError(409, ErrorCodes.EmailExists, "An account with this email already exists");
      }
      throw err;
    }

    const userId = user._id.toString();

    try {
      await this.deps.categoryService.restoreDefaults(userId);
    } catch (err) {
      this.deps.logger.warn({
        event: "category_seed_failed",
        userId,
        err: String(err),
      });
    }

    await authRepository.writeAuditLog({
      userId,
      actor: `user:${userId}`,
      action: "auth.register",
      targetType: "user",
      targetId: userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return { userId };
  }

  async login(input: LoginRequest, ctx: RequestContext): Promise<AuthResult> {
    const email = input.email.toLowerCase();
    assertRateLimit(
      this.deps.accountRateLimiter.check(SlidingWindowRateLimiter.accountKey(email)),
      "Too many login attempts for this account, please try again later",
    );

    const user = await authRepository.findUserByEmail(email);

    if (!user) {
      throw new AppError(401, ErrorCodes.Unauthorized, "Invalid email or password", {
        cause: "no_such_user",
      });
    }

    const userId = user._id.toString();

    if (user.security.lockedUntil && user.security.lockedUntil.getTime() > Date.now()) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((user.security.lockedUntil.getTime() - Date.now()) / 1000),
      );
      throw new AppError(403, ErrorCodes.AccountLocked, "Account temporarily locked due to too many failed attempts", {
        retryable: true,
        retryAfterSeconds,
      });
    }

    const valid = await verifyPassword(user.passwordHash, input.password);
    if (!valid) {
      const attempts = user.security.loginAttempts + 1;
      if (attempts >= this.deps.config.bruteForce.maxLoginAttempts) {
        const until = new Date(Date.now() + this.deps.config.bruteForce.lockoutSeconds * 1000);
        await authRepository.lockAccount(userId, until);
        await authRepository.writeAuditLog({
          userId,
          actor: `user:${userId}`,
          action: "auth.locked",
          targetType: "user",
          targetId: userId,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          requestId: ctx.requestId,
          after: { lockedUntil: until.toISOString() },
        });
        throw new AppError(403, ErrorCodes.AccountLocked, "Account temporarily locked due to too many failed attempts", {
          retryable: true,
          retryAfterSeconds: this.deps.config.bruteForce.lockoutSeconds,
        });
      }
      await authRepository.incrementLoginFailures(userId, attempts);
      await authRepository.writeAuditLog({
        userId,
        actor: `user:${userId}`,
        action: "auth.login_failed",
        targetType: "user",
        targetId: userId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
        after: { reason: "bad_password" },
      });
      throw new AppError(401, ErrorCodes.Unauthorized, "Invalid email or password");
    }

    await authRepository.resetLoginFailures(userId);

    if (user.status !== "active") {
      throw new AppError(403, ErrorCodes.AccountDisabled, "This account is not active");
    }

    if (passwordNeedsRehash(user.passwordHash)) {
      const freshHash = await hashPassword(input.password);
      await authRepository.updatePasswordHash(userId, freshHash).catch((err: unknown) => {
        this.deps.logger.warn({ err: String(err), event: "password_rehash_failed" });
      });
    }

    const device = normalizeDevice(input.device);
    const refreshToken = createRefreshToken();
    const deviceRecord = await authRepository.createDevice({
      userId,
      deviceName: device.name,
      platform: device.platform,
      deviceFingerprint: this.hashFingerprint(device.fingerprint),
      refreshTokenHash: hashToken(refreshToken),
      refreshTokenFamily: randomUUID(),
      refreshTokenExpiresAt: refreshTokenExpiry(this.deps.config),
    } satisfies CreateDeviceInput);

    const accessToken = await signAccessToken(this.deps.config, {
      userId,
      deviceId: deviceRecord._id.toString(),
      tokenVersion: user.tokenVersion,
    });

    await authRepository.writeAuditLog({
      userId,
      actor: `user:${userId}`,
      action: "auth.login",
      targetType: "device",
      targetId: deviceRecord._id.toString(),
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return {
      accessToken,
      refreshToken,
      deviceId: deviceRecord._id.toString(),
      user: toUserPublic(user),
    };
  }

  async refresh(rawToken: string, ctx: RequestContext): Promise<RefreshResult> {
    const hash = hashToken(rawToken);
    const device = await authRepository.findDeviceByRefreshHash(hash);

    if (!device) {
      await authRepository.writeAuditLog({
        action: "auth.refresh_invalid",
        actor: "system",
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      });
      throw new AppError(401, ErrorCodes.TokenRevoked, "Session is no longer valid");
    }

    if (device.revokedAt) {
      throw new AppError(401, ErrorCodes.DeviceRevoked, "Session has been revoked");
    }

    const isReuse = device.previousRefreshTokenHash === hash;
    if (isReuse) {
      await authRepository.revokeFamily(device.refreshTokenFamily, "refresh token reuse detected");
      await authRepository.bumpTokenVersion(device.userId);
      await authRepository.writeAuditLog({
        userId: device.userId,
        actor: `device:${device.id}`,
        action: "auth.refresh_reuse",
        targetType: "device",
        targetId: device.id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      });
      throw new AppError(401, ErrorCodes.RefreshReuse, "Session reused unexpectedly, please sign in again");
    }

    if (device.refreshTokenExpiresAt.getTime() <= Date.now()) {
      await authRepository.writeAuditLog({
        userId: device.userId,
        actor: `device:${device.id}`,
        action: "auth.refresh_expired",
        targetType: "device",
        targetId: device.id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      });
      throw new AppError(401, ErrorCodes.TokenExpired, "Session has expired, please sign in again");
    }

    const user = await authRepository.findUserById(device.userId);
    if (!user || user.status !== "active") {
      throw new AppError(401, ErrorCodes.Unauthorized, "Session is no longer valid");
    }

    const newRefreshToken = createRefreshToken();
    await authRepository.rotateRefreshToken(device.id, {
      oldHash: hash,
      newHash: hashToken(newRefreshToken),
      refreshTokenExpiresAt: refreshTokenExpiry(this.deps.config),
    });

    const accessToken = await signAccessToken(this.deps.config, {
      userId: user._id.toString(),
      deviceId: device.id,
      tokenVersion: user.tokenVersion,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(deviceId: string, userId: string, ctx: RequestContext): Promise<void> {
    const device = await authRepository.findDeviceByIdAndUser(deviceId, userId);
    if (!device) {
      throw new AppError(404, ErrorCodes.NotFound, "Device not found");
    }
    await authRepository.revokeDevice(device._id.toString(), "logout");
    await authRepository.writeAuditLog({
      userId,
      actor: `user:${userId}`,
      action: "auth.logout",
      targetType: "device",
      targetId: device._id.toString(),
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
  }

  async logoutAll(userId: string, ctx: RequestContext): Promise<void> {
    await authRepository.revokeAllDevicesForUser(userId, "logout-all");
    await authRepository.bumpTokenVersion(userId);
    await authRepository.writeAuditLog({
      userId,
      actor: `user:${userId}`,
      action: "auth.logout_all",
      targetType: "user",
      targetId: userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
  }

  async me(userId: string): Promise<UserPublic> {
    const user = await authRepository.findUserById(userId);
    if (!user) {
      throw new AppError(404, ErrorCodes.NotFound, "User not found");
    }
    return toUserPublic(user);
  }

  private isDuplicateKeyError(err: unknown): boolean {
    return (
      typeof err === "object" &&
      err !== null &&
      (err as { code?: number }).code === 11000
    );
  }

  private hashFingerprint(fingerprint: string): string {
    if (!fingerprint) return "";
    return createHash("sha256").update(fingerprint).digest("hex");
  }
}
