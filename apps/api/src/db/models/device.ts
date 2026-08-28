import { Schema, model, type Types } from "mongoose";
import { DevicePlatform } from "@moneytalks/shared";

export interface DeviceDocumentFields {
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
  revokedReason: string | null;
}

const deviceSchema = new Schema<DeviceDocumentFields>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    deviceName: { type: String, default: "" },
    platform: {
      type: String,
      enum: Object.values(DevicePlatform),
      default: DevicePlatform.Web,
    },
    deviceFingerprint: { type: String, default: "" },
    refreshTokenHash: { type: String, required: true },
    previousRefreshTokenHash: { type: String, default: null },
    refreshTokenFamily: { type: String, required: true },
    refreshTokenExpiresAt: { type: Date, required: true },
    lastSeenAt: { type: Date, default: Date.now },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: null },
  },
  {
    timestamps: true,
  },
);

deviceSchema.index({ userId: 1 });
deviceSchema.index({ refreshTokenHash: 1 }, { unique: true });
deviceSchema.index({ previousRefreshTokenHash: 1 });
deviceSchema.index({ refreshTokenFamily: 1 });

export const DeviceModel = model<DeviceDocumentFields>("Device", deviceSchema);
