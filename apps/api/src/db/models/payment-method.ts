import { Schema, model, type Types } from "mongoose";
import { EntityStatus, PaymentMethodKind } from "@moneytalks/shared";

export interface PaymentMethodDocumentFields {
  userId: Types.ObjectId;
  clientId: string;
  name: string;
  kind: string;
  provider?: string;
  maskedNumber?: string;
  accountRef?: string;
  isDefault: boolean;
  status: string;
  deletedAt?: Date | null;
  deletedBy?: Types.ObjectId | null;
  rev: number;
  createdAt: Date;
  updatedAt: Date;
}

const paymentMethodSchema = new Schema<PaymentMethodDocumentFields>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    clientId: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    kind: {
      type: String,
      enum: Object.values(PaymentMethodKind),
      required: true,
    },
    provider: { type: String, maxlength: 60 },
    maskedNumber: { type: String, maxlength: 20 },
    accountRef: { type: String, maxlength: 80 },
    isDefault: { type: Boolean, default: false },
    status: {
      type: String,
      enum: Object.values(EntityStatus),
      default: EntityStatus.Active,
    },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User" },
    rev: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  },
);

paymentMethodSchema.index(
  { userId: 1, name: 1, kind: 1, deletedAt: 1 },
  { unique: true },
);
paymentMethodSchema.index({ userId: 1 });
paymentMethodSchema.index({ userId: 1, clientId: 1 }, { unique: true });

export const PaymentMethodModel = model<PaymentMethodDocumentFields>(
  "PaymentMethod",
  paymentMethodSchema,
);
