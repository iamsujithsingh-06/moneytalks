import { Schema, model, type Types } from "mongoose";
import { CategoryType, EntityStatus } from "@moneytalks/shared";

export interface CategoryDocumentFields {
  userId: Types.ObjectId;
  clientId: string;
  name: string;
  type: string;
  icon?: string;
  color?: string;
  parentId?: Types.ObjectId | null;
  sortOrder: number;
  isPreset: boolean;
  isDefault: boolean;
  status: string;
  deletedAt?: Date | null;
  deletedBy?: Types.ObjectId | null;
  rev: number;
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema<CategoryDocumentFields>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    clientId: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    type: {
      type: String,
      enum: Object.values(CategoryType),
      required: true,
    },
    icon: { type: String, maxlength: 50 },
    color: { type: String, match: /^#[0-9a-fA-F]{6}$/ },
    parentId: { type: Schema.Types.ObjectId, ref: "Category" },
    sortOrder: { type: Number, required: true, default: 0 },
    isPreset: { type: Boolean, default: false },
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

categorySchema.index(
  { userId: 1, name: 1, type: 1, deletedAt: 1 },
  { unique: true },
);
categorySchema.index({ userId: 1, type: 1, sortOrder: 1 });
categorySchema.index({ userId: 1, clientId: 1 }, { unique: true });

export const CategoryModel = model<CategoryDocumentFields>(
  "Category",
  categorySchema,
);
