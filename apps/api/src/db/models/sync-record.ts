import { Schema, model, type Types } from "mongoose";
import { SYNC_ENTITIES } from "@moneytalks/types";

export interface SyncRecordDocumentFields {
  userId: Types.ObjectId;
  deviceId: string;
  entity: string;
  lastCursor: string | null;
  lastSyncAt: Date | null;
  opsProcessed: number;
  state: "idle" | "syncing" | "error";
  createdAt: Date;
  updatedAt: Date;
}

const syncRecordSchema = new Schema<SyncRecordDocumentFields>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    deviceId: { type: String, required: true, trim: true },
    entity: { type: String, enum: SYNC_ENTITIES, required: true },
    lastCursor: { type: String, default: null },
    lastSyncAt: { type: Date, default: null },
    opsProcessed: { type: Number, default: 0 },
    state: {
      type: String,
      enum: ["idle", "syncing", "error"],
      default: "idle",
    },
  },
  {
    timestamps: true,
  },
);

syncRecordSchema.index({ userId: 1, deviceId: 1, entity: 1 }, { unique: true });

export const SyncRecordModel = model<SyncRecordDocumentFields>(
  "SyncRecord",
  syncRecordSchema,
);
