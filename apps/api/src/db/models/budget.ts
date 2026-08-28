import { Schema, model, type Types } from "mongoose";
import {
  BudgetPeriod,
  BudgetScope,
  BudgetStatus,
  isPositiveMinorUnitsAmount,
} from "@moneytalks/shared";

export interface BudgetAlertThresholdsFields {
  warningPct: number;
  hardPct: number;
}

export interface BudgetDocumentFields {
  userId: Types.ObjectId;
  clientId: string;
  categoryId?: Types.ObjectId | null;
  scope: string;
  period: string;
  periodAnchor?: Date | null;
  allocatedMinor: number;
  currency: string;
  rollover: boolean;
  status: string;
  alertThresholds: BudgetAlertThresholdsFields;
  deletedAt?: Date | null;
  deletedBy?: Types.ObjectId | null;
  rev: number;
  createdAt: Date;
  updatedAt: Date;
}

const alertThresholdsSchema = new Schema<BudgetAlertThresholdsFields>(
  {
    warningPct: { type: Number, required: true, min: 1, max: 100 },
    hardPct: { type: Number, required: true, min: 1, max: 100 },
  },
  { _id: false },
);

const budgetSchema = new Schema<BudgetDocumentFields>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    clientId: { type: String, required: true, trim: true },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category" },
    scope: {
      type: String,
      enum: Object.values(BudgetScope),
      required: true,
    },
    period: {
      type: String,
      enum: Object.values(BudgetPeriod),
      required: true,
    },
    periodAnchor: { type: Date, default: null },
    allocatedMinor: {
      type: Number,
      required: true,
      validate: {
        validator: isPositiveMinorUnitsAmount,
        message: "allocatedMinor must be a positive integer in minor units",
      },
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      maxlength: 3,
    },
    rollover: { type: Boolean, default: false },
    status: {
      type: String,
      enum: Object.values(BudgetStatus),
      default: BudgetStatus.Active,
    },
    alertThresholds: {
      type: alertThresholdsSchema,
      required: true,
      validate: {
        validator: (value: BudgetAlertThresholdsFields) =>
          value.hardPct >= value.warningPct,
        message: "hardPct must be greater than or equal to warningPct",
      },
    },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User" },
    rev: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  },
);

// One active, non-deleted category budget per user+category+period. The
// partial filter keeps the uniqueness scoped to active category budgets so a
// paused/completed/soft-deleted budget does not block a new active one.
budgetSchema.index(
  { userId: 1, categoryId: 1, period: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: "active",
      categoryId: { $type: "objectId" },
      deletedAt: null,
    },
  },
);

// One active, non-deleted overall budget per user+period (categoryId is null
// for overall, so it needs its own partial unique index).
budgetSchema.index(
  { userId: 1, period: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "active", scope: "overall", deletedAt: null },
  },
);

budgetSchema.index({ userId: 1 });
budgetSchema.index({ userId: 1, period: 1, status: 1 });
budgetSchema.index({ userId: 1, clientId: 1 }, { unique: true });

export const BudgetModel = model<BudgetDocumentFields>("Budget", budgetSchema);
