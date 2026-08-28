import { Types } from "mongoose";
import { UserModel, DeviceModel, AuditLogModel } from "../../db/index.js";

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  name?: string | null;
}

export interface CreateDeviceInput {
  userId: Types.ObjectId | string;
  deviceName: string;
  platform: string;
  deviceFingerprint: string;
  refreshTokenHash: string;
  refreshTokenFamily: string;
  refreshTokenExpiresAt: Date;
}

export interface DeviceAuthRecord {
  id: string;
  userId: string;
  deviceName: string;
  platform: string;
  deviceFingerprint: string;
  refreshTokenHash: string;
  previousRefreshTokenHash: string | null;
  refreshTokenFamily: string;
  refreshTokenExpiresAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
}

async function createUser(input: CreateUserInput) {
  const doc = await UserModel.create({
    email: input.email,
    passwordHash: input.passwordHash,
    name: input.name ?? null,
  });
  return doc;
}

async function findUserByEmail(email: string) {
  return UserModel.findOne({ email: email.toLowerCase() }).exec();
}

async function findUserById(id: string | Types.ObjectId) {
  return UserModel.findById(id).exec();
}

async function incrementLoginFailures(id: string | Types.ObjectId, attempts: number) {
  return UserModel.updateOne(
    { _id: id },
    { $set: { "security.loginAttempts": attempts } },
  ).exec();
}

async function resetLoginFailures(id: string | Types.ObjectId) {
  return UserModel.updateOne(
    { _id: id },
    { $set: { "security.loginAttempts": 0, "security.lockedUntil": null } },
  ).exec();
}

async function lockAccount(id: string | Types.ObjectId, until: Date) {
  return UserModel.updateOne(
    { _id: id },
    { $set: { "security.lockedUntil": until } },
  ).exec();
}

async function bumpTokenVersion(id: string | Types.ObjectId) {
  return UserModel.updateOne({ _id: id }, { $inc: { tokenVersion: 1 } }).exec();
}

async function updatePasswordHash(id: string | Types.ObjectId, passwordHash: string) {
  return UserModel.updateOne({ _id: id }, { $set: { passwordHash } }).exec();
}

async function createDevice(input: CreateDeviceInput) {
  const doc = await DeviceModel.create({
    userId: input.userId,
    deviceName: input.deviceName,
    platform: input.platform,
    deviceFingerprint: input.deviceFingerprint,
    refreshTokenHash: input.refreshTokenHash,
    refreshTokenFamily: input.refreshTokenFamily,
    refreshTokenExpiresAt: input.refreshTokenExpiresAt,
  });
  return doc;
}

/**
 * Find a device by the SHA-256 hash of a presented refresh token, matching
 * either the current hash or the previously rotated one (reuse detection).
 */
async function findDeviceByRefreshHash(
  refreshTokenHash: string,
): Promise<DeviceAuthRecord | null> {
  const doc = await DeviceModel.findOne({
    $or: [
      { refreshTokenHash },
      { previousRefreshTokenHash: refreshTokenHash },
    ],
  }).exec();

  if (!doc) return null;
  return toDeviceAuthRecord(doc);
}

async function findDeviceByIdAndUser(deviceId: string, userId: string) {
  return DeviceModel.findOne({ _id: deviceId, userId }).exec();
}

async function rotateRefreshToken(
  deviceId: string,
  next: {
    oldHash: string;
    newHash: string;
    refreshTokenExpiresAt: Date;
  },
) {
  return DeviceModel.updateOne(
    { _id: deviceId },
    {
      $set: {
        previousRefreshTokenHash: next.oldHash,
        refreshTokenHash: next.newHash,
        refreshTokenExpiresAt: next.refreshTokenExpiresAt,
        lastSeenAt: new Date(),
      },
    },
  ).exec();
}

async function touchDevice(deviceId: string) {
  return DeviceModel.updateOne(
    { _id: deviceId },
    { $set: { lastSeenAt: new Date() } },
  ).exec();
}

async function revokeDevice(deviceId: string, reason: string) {
  return DeviceModel.updateOne(
    { _id: deviceId },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
  ).exec();
}

async function revokeFamily(family: string, reason: string) {
  return DeviceModel.updateMany(
    { refreshTokenFamily: family },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
  ).exec();
}

async function revokeAllDevicesForUser(userId: string, reason: string) {
  return DeviceModel.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
  ).exec();
}

export interface AuditLogInput {
  userId?: string | Types.ObjectId | null;
  actor: string;
  action: string;
  targetType?: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

async function writeAuditLog(input: AuditLogInput) {
  const doc = await AuditLogModel.create({
    userId: input.userId ? new Types.ObjectId(input.userId) : undefined,
    actor: input.actor,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    before: input.before,
    after: input.after,
    ip: input.ip,
    userAgent: input.userAgent,
    requestId: input.requestId,
  });
  return doc;
}

function toDeviceAuthRecord(doc: {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  deviceName: string;
  platform: string;
  deviceFingerprint: string;
  refreshTokenHash: string;
  previousRefreshTokenHash: string | null;
  refreshTokenFamily: string;
  refreshTokenExpiresAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
}): DeviceAuthRecord {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    deviceName: doc.deviceName,
    platform: doc.platform,
    deviceFingerprint: doc.deviceFingerprint,
    refreshTokenHash: doc.refreshTokenHash,
    previousRefreshTokenHash: doc.previousRefreshTokenHash,
    refreshTokenFamily: doc.refreshTokenFamily,
    refreshTokenExpiresAt: doc.refreshTokenExpiresAt,
    lastSeenAt: doc.lastSeenAt,
    revokedAt: doc.revokedAt,
  };
}

export const authRepository = {
  createUser,
  findUserByEmail,
  findUserById,
  incrementLoginFailures,
  resetLoginFailures,
  lockAccount,
  bumpTokenVersion,
  updatePasswordHash,
  createDevice,
  findDeviceByRefreshHash,
  findDeviceByIdAndUser,
  rotateRefreshToken,
  touchDevice,
  revokeDevice,
  revokeFamily,
  revokeAllDevicesForUser,
  writeAuditLog,
};
