import { Schema, model, type Types } from "mongoose";
import { UserStatus } from "@moneytalks/shared";

export interface UserDocumentFields {
  email: string;
  passwordHash: string;
  name: string | null;
  emailVerifiedAt: Date | null;
  status: string;
  defaultCurrency: string;
  preferences: {
    theme: "dark" | "light";
    locale: string;
  };
  security: {
    loginAttempts: number;
    lockedUntil: Date | null;
  };
  tokenVersion: number;
  deletedAt: Date | null;
  deletedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDocumentFields>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    name: { type: String, default: null },
    emailVerifiedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: Object.values(UserStatus),
      default: UserStatus.Active,
    },
    defaultCurrency: { type: String, default: "INR" },
    preferences: {
      theme: { type: String, enum: ["dark", "light"], default: "dark" },
      locale: { type: String, default: "en" },
    },
    security: {
      loginAttempts: { type: Number, default: 0 },
      lockedUntil: { type: Date, default: null },
    },
    tokenVersion: { type: Number, default: 0 },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId },
  },
  {
    timestamps: true,
  },
);

userSchema.index({ status: 1 });

export const UserModel = model<UserDocumentFields>("User", userSchema);
