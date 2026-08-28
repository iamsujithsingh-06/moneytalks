import { Schema, model, type Types } from "mongoose";
import {
  CategorizedBy,
  TransactionDirection,
  TransactionSource,
  TransactionStatus,
  TransactionType,
  isPositiveMinorUnitsAmount,
} from "@moneytalks/shared";

export interface SmsRefFields {
  senderHash: string;
  receivedAt: Date;
  messageHash: string;
  upiRef?: string;
  bankRef?: string;
}

export interface ImportRefFields {
  importId: Types.ObjectId;
  rowIndex: number;
  originalAmount?: string;
  originalDate?: string;
}

export interface OcrRefFields {
  receiptId: Types.ObjectId;
  fieldConfidence: Record<string, number>;
  totalConfidence: number;
}

export interface TransactionDocumentFields {
  userId: Types.ObjectId;
  clientId: string;
  type: string;
  source: string;
  status: string;
  direction: string;
  amountMinor: number;
  currency: string;
  transactionDate: Date;
  merchant?: string | null;
  counterparty?: string | null;
  note?: string | null;
  tags: string[];
  categoryId?: Types.ObjectId | null;
  paymentMethodId?: Types.ObjectId | null;
  accountRef?: string | null;
  fingerprint?: string;
  smsRef?: SmsRefFields;
  importRef?: ImportRefFields;
  ocrRef?: OcrRefFields;
  confidence?: number | null;
  confidenceDetail?: Record<string, number>;
  autoDetected: boolean;
  detectedAt?: Date | null;
  categorizedBy?: string | null;
  categoryConfidence?: number;
  confirmedBy?: Types.ObjectId | null;
  confirmedAt?: Date | null;
  rejectedAt?: Date | null;
  rejectedReason?: string | null;
  editedAt?: Date | null;
  editedBy?: Types.ObjectId | null;
  editedCount: number;
  duplicateOf?: Types.ObjectId | null;
  duplicateGroup?: string | null;
  deletedAt?: Date | null;
  deletedBy?: Types.ObjectId | null;
  rev: number;
  createdAt: Date;
  updatedAt: Date;
}

const smsRefSchema = new Schema<SmsRefFields>(
  {
    senderHash: { type: String, required: true },
    receivedAt: { type: Date, required: true },
    messageHash: { type: String, required: true },
    upiRef: { type: String },
    bankRef: { type: String },
  },
  { _id: false },
);

const importRefSchema = new Schema<ImportRefFields>(
  {
    importId: { type: Schema.Types.ObjectId, ref: "Import", required: true },
    rowIndex: { type: Number, required: true },
    originalAmount: { type: String },
    originalDate: { type: String },
  },
  { _id: false },
);

const ocrRefSchema = new Schema<OcrRefFields>(
  {
    receiptId: { type: Schema.Types.ObjectId, ref: "Receipt", required: true },
    fieldConfidence: { type: Schema.Types.Mixed, default: {} },
    totalConfidence: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false },
);

const transactionSchema = new Schema<TransactionDocumentFields>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    clientId: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: Object.values(TransactionType),
      required: true,
    },
    source: {
      type: String,
      enum: Object.values(TransactionSource),
      required: true,
      default: TransactionSource.Manual,
    },
    status: {
      type: String,
      enum: Object.values(TransactionStatus),
      required: true,
      default: TransactionStatus.Confirmed,
    },
    direction: {
      type: String,
      enum: Object.values(TransactionDirection),
      required: true,
    },
    amountMinor: {
      type: Number,
      required: true,
      validate: {
        validator: isPositiveMinorUnitsAmount,
        message: "amountMinor must be a positive integer in minor units",
      },
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      maxlength: 3,
    },
    transactionDate: { type: Date, required: true },
    merchant: { type: String, trim: true },
    counterparty: { type: String, trim: true },
    note: { type: String, trim: true },
    tags: { type: [String], default: [] },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category" },
    paymentMethodId: { type: Schema.Types.ObjectId, ref: "PaymentMethod" },
    accountRef: { type: String, trim: true },
    fingerprint: { type: String, trim: true },
    smsRef: { type: smsRefSchema },
    importRef: { type: importRefSchema },
    ocrRef: { type: ocrRefSchema },
    confidence: { type: Number, min: 0, max: 1 },
    confidenceDetail: { type: Schema.Types.Mixed },
    autoDetected: { type: Boolean, default: false },
    detectedAt: { type: Date, default: null },
    categorizedBy: {
      type: String,
      enum: Object.values(CategorizedBy),
      default: null,
    },
    categoryConfidence: { type: Number, min: 0, max: 1 },
    confirmedBy: { type: Schema.Types.ObjectId, ref: "User" },
    confirmedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    rejectedReason: { type: String },
    editedAt: { type: Date, default: null },
    editedBy: { type: Schema.Types.ObjectId, ref: "User" },
    editedCount: { type: Number, default: 0 },
    duplicateOf: { type: Schema.Types.ObjectId, ref: "Transaction" },
    duplicateGroup: { type: String },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User" },
    rev: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  },
);

transactionSchema.index({ userId: 1, transactionDate: -1 });
transactionSchema.index({ userId: 1, status: 1, transactionDate: -1 });
transactionSchema.index({ userId: 1, categoryId: 1, transactionDate: -1 });
transactionSchema.index({ userId: 1, source: 1 });
transactionSchema.index({ userId: 1, updatedAt: 1 });
transactionSchema.index({ userId: 1, clientId: 1 }, { unique: true });
transactionSchema.index(
  { userId: 1, fingerprint: 1 },
  { unique: true, partialFilterExpression: { fingerprint: { $type: "string" } } },
);

export const TransactionModel = model<TransactionDocumentFields>(
  "Transaction",
  transactionSchema,
);
