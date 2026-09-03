import { Schema, model, type Types } from "mongoose";

export interface SettingsDocumentFields {
  userId: Types.ObjectId;
  clientId: string;
  /** Current starting balance in minor units. `0` means unset. */
  initialBalanceMinor: number;
  deletedAt?: Date | null;
  deletedBy?: Types.ObjectId | null;
  rev: number;
  createdAt: Date;
  updatedAt: Date;
}

const settingsSchema = new Schema<SettingsDocumentFields>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    clientId: { type: String, required: true, trim: true },
    initialBalanceMinor: { type: Number, default: 0, min: 0 },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User" },
    rev: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  },
);

settingsSchema.index({ userId: 1 });
settingsSchema.index({ userId: 1, clientId: 1 }, { unique: true });

export const SettingsModel = model<SettingsDocumentFields>(
  "Settings",
  settingsSchema,
);
