import { Types } from "mongoose";
import { validationError } from "../../lib/errors.js";
import {
  TransactionModel,
  type TransactionDocumentFields,
} from "../../db/models/transaction.js";

export interface NewTransactionRecord {
  userId: Types.ObjectId | string;
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
  tags?: string[];
  categoryId?: Types.ObjectId | string | null;
  paymentMethodId?: Types.ObjectId | string | null;
  accountRef?: string | null;
  fingerprint?: string;
}

export interface TransactionRecord {
  id: string;
  userId: string;
  clientId: string;
  type: string;
  source: string;
  status: string;
  direction: string;
  amountMinor: number;
  currency: string;
  transactionDate: Date;
  merchant: string | null;
  counterparty: string | null;
  note: string | null;
  tags: string[];
  categoryId: string | null;
  paymentMethodId: string | null;
  accountRef: string | null;
  fingerprint: string | null;
  confidence: number | null;
  autoDetected: boolean;
  duplicateOf: string | null;
  duplicateGroup: string | null;
  editedCount: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  rev: number;
}

export interface TransactionListFilter {
  type?: string;
  source?: string;
  status?: string;
  direction?: string;
  categoryId?: string;
  paymentMethodId?: string;
  q?: string;
  from?: string;
  to?: string;
  minAmount?: number;
  maxAmount?: number;
  merchant?: string;
  tags?: string[];
  duplicatesOnly?: boolean;
}

export interface TransactionListOptions {
  limit: number;
  cursor?: string;
}

export interface TransactionUpdateRecord {
  type?: string;
  status?: string;
  direction?: string;
  amountMinor?: number;
  currency?: string;
  transactionDate?: Date;
  merchant?: string | null;
  counterparty?: string | null;
  note?: string | null;
  tags?: string[];
  categoryId?: Types.ObjectId | string | null;
  paymentMethodId?: Types.ObjectId | string | null;
  accountRef?: string | null;
  fingerprint?: string;
}

export interface TransactionListResult {
  items: TransactionRecord[];
  nextCursor: string | null;
  total: number;
}

export interface TransactionRepository {
  create(input: NewTransactionRecord): Promise<TransactionRecord>;
  findById(
    userId: string | Types.ObjectId,
    id: string | Types.ObjectId,
  ): Promise<TransactionRecord | null>;
  findByClientId(
    userId: string | Types.ObjectId,
    clientId: string,
  ): Promise<TransactionRecord | null>;
  findByFingerprint(
    userId: string | Types.ObjectId,
    fingerprint: string,
  ): Promise<TransactionRecord | null>;
  countByUser(userId: string | Types.ObjectId): Promise<number>;
  list(
    userId: string | Types.ObjectId,
    filter: TransactionListFilter,
    options: TransactionListOptions,
  ): Promise<TransactionListResult>;
  update(
    userId: string | Types.ObjectId,
    id: string | Types.ObjectId,
    update: TransactionUpdateRecord,
    editedBy: string | Types.ObjectId,
  ): Promise<TransactionRecord | null>;
  softDelete(
    userId: string | Types.ObjectId,
    id: string | Types.ObjectId,
    deletedBy: string | Types.ObjectId,
  ): Promise<TransactionRecord | null>;
  countByCategory(
    userId: string | Types.ObjectId,
    categoryId: string | Types.ObjectId,
  ): Promise<number>;
  reassignCategory(
    userId: string | Types.ObjectId,
    fromCategoryId: string | Types.ObjectId,
    toCategoryId: string | Types.ObjectId,
  ): Promise<number>;
}

type TransactionDoc = TransactionDocumentFields & { _id: Types.ObjectId };

function toRecord(doc: TransactionDoc): TransactionRecord {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    clientId: doc.clientId,
    type: doc.type,
    source: doc.source,
    status: doc.status,
    direction: doc.direction,
    amountMinor: doc.amountMinor,
    currency: doc.currency,
    transactionDate: doc.transactionDate,
    merchant: doc.merchant ?? null,
    counterparty: doc.counterparty ?? null,
    note: doc.note ?? null,
    tags: doc.tags ?? [],
    categoryId: doc.categoryId ? doc.categoryId.toString() : null,
    paymentMethodId: doc.paymentMethodId ? doc.paymentMethodId.toString() : null,
    accountRef: doc.accountRef ?? null,
    fingerprint: doc.fingerprint ?? null,
    confidence: doc.confidence ?? null,
    autoDetected: doc.autoDetected ?? false,
    duplicateOf: doc.duplicateOf ? doc.duplicateOf.toString() : null,
    duplicateGroup: doc.duplicateGroup ?? null,
    editedCount: doc.editedCount ?? 0,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    deletedAt: doc.deletedAt ?? null,
    rev: doc.rev ?? 0,
  };
}

export function createTransactionRepository(): TransactionRepository {
  async function create(input: NewTransactionRecord) {
    const doc = await TransactionModel.create({
      userId: input.userId,
      clientId: input.clientId,
      type: input.type,
      source: input.source,
      status: input.status,
      direction: input.direction,
      amountMinor: input.amountMinor,
      currency: input.currency,
      transactionDate: input.transactionDate,
      merchant: input.merchant ?? null,
      counterparty: input.counterparty ?? null,
      note: input.note ?? null,
      tags: input.tags ?? [],
      categoryId: input.categoryId ?? undefined,
      paymentMethodId: input.paymentMethodId ?? undefined,
      accountRef: input.accountRef ?? null,
      fingerprint: input.fingerprint,
    });
    return toRecord(doc);
  }

  async function findById(
    userId: string | Types.ObjectId,
    id: string | Types.ObjectId,
  ) {
    const doc = await TransactionModel.findOne({
      _id: id,
      userId,
      deletedAt: null,
    }).exec();
    return doc ? toRecord(doc) : null;
  }

  async function findByClientId(
    userId: string | Types.ObjectId,
    clientId: string,
  ) {
    const doc = await TransactionModel.findOne({ userId, clientId }).exec();
    return doc ? toRecord(doc) : null;
  }

  async function findByFingerprint(
    userId: string | Types.ObjectId,
    fingerprint: string,
  ) {
    const doc = await TransactionModel.findOne({ userId, fingerprint }).exec();
    return doc ? toRecord(doc) : null;
  }

  async function countByUser(userId: string | Types.ObjectId) {
    return TransactionModel.countDocuments({ userId }).exec();
  }

  async function countByCategory(
    userId: string | Types.ObjectId,
    categoryId: string | Types.ObjectId,
  ) {
    return TransactionModel.countDocuments({
      userId,
      categoryId: new Types.ObjectId(categoryId),
      deletedAt: null,
    }).exec();
  }

  async function reassignCategory(
    userId: string | Types.ObjectId,
    fromCategoryId: string | Types.ObjectId,
    toCategoryId: string | Types.ObjectId,
  ) {
    const result = await TransactionModel.updateMany(
      {
        userId,
        categoryId: new Types.ObjectId(fromCategoryId),
        deletedAt: null,
      },
      {
        $set: { categoryId: new Types.ObjectId(toCategoryId) },
        $inc: { rev: 1 },
      },
    ).exec();
    return result.modifiedCount;
  }

  return {
    create,
    findById,
    findByClientId,
    findByFingerprint,
    countByUser,
    list,
    update,
    softDelete,
    countByCategory,
    reassignCategory,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function encodeCursor(date: Date, id: string): string {
  return Buffer.from(`${date.toISOString()}::${id}`, "utf8").toString(
    "base64url",
  );
}

function decodeCursor(
  cursor: string,
): { date: Date; id: Types.ObjectId } | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const separator = raw.lastIndexOf("::");
    if (separator <= 0) return null;
    const date = new Date(raw.slice(0, separator));
    const id = raw.slice(separator + 2);
    if (Number.isNaN(date.getTime()) || !/^[0-9a-f]{24}$/.test(id)) {
      return null;
    }
    return { date, id: new Types.ObjectId(id) };
  } catch {
    return null;
  }
}

async function list(
  userId: string | Types.ObjectId,
  filter: TransactionListFilter,
  options: TransactionListOptions,
): Promise<TransactionListResult> {
  const query: Record<string, unknown> = { userId, deletedAt: null };

  if (filter.type) query.type = filter.type;
  if (filter.source) query.source = filter.source;
  if (filter.status) query.status = filter.status;
  if (filter.direction) query.direction = filter.direction;
  if (filter.categoryId) query.categoryId = new Types.ObjectId(filter.categoryId);
  if (filter.paymentMethodId) {
    query.paymentMethodId = new Types.ObjectId(filter.paymentMethodId);
  }
  if (filter.merchant) query.merchant = filter.merchant;
  if (filter.tags && filter.tags.length > 0) {
    query.tags = { $all: filter.tags };
  }
  if (filter.minAmount !== undefined || filter.maxAmount !== undefined) {
    const range: Record<string, number> = {};
    if (filter.minAmount !== undefined) range.$gte = filter.minAmount;
    if (filter.maxAmount !== undefined) range.$lte = filter.maxAmount;
    query.amountMinor = range;
  }
  const dateRange: Record<string, Date> = {};
  if (filter.from) dateRange.$gte = new Date(`${filter.from}T00:00:00.000Z`);
  if (filter.to) dateRange.$lte = new Date(`${filter.to}T23:59:59.999Z`);
  if (Object.keys(dateRange).length > 0) query.transactionDate = dateRange;

  const andConditions: Record<string, unknown>[] = [];
  if (filter.q && filter.q.length > 0) {
    const rx = new RegExp(escapeRegExp(filter.q), "i");
    andConditions.push({
      $or: [{ merchant: rx }, { counterparty: rx }, { note: rx }],
    });
  }
  if (filter.duplicatesOnly) {
    andConditions.push({
      $or: [
        { duplicateOf: { $exists: true, $ne: null } },
        { duplicateGroup: { $exists: true, $ne: null } },
      ],
    });
  }

  const listQuery: Record<string, unknown> = { ...query };
  if (andConditions.length === 1) {
    const single = andConditions[0];
    if (single) Object.assign(listQuery, single);
  } else if (andConditions.length > 1) {
    listQuery.$and = andConditions;
  }

  const total = await TransactionModel.countDocuments(listQuery).exec();

  if (options.cursor) {
    const decoded = decodeCursor(options.cursor);
    if (!decoded) {
      throw validationError("Cursor is invalid", [
        { field: "cursor", message: "cursor could not be decoded" },
      ]);
    }
    const existingAnd = listQuery.$and;
    const cursorAnd: Record<string, unknown> = {
      $or: [
        { transactionDate: { $lt: decoded.date } },
        { transactionDate: decoded.date, _id: { $lt: decoded.id } },
      ],
    };
    listQuery.$and = [
      ...(Array.isArray(existingAnd) ? existingAnd : []),
      cursorAnd,
    ];
  }

  const fetched = await TransactionModel.find(listQuery)
    .sort({ transactionDate: -1, _id: -1 })
    .limit(options.limit + 1)
    .exec();

  const hasMore = fetched.length > options.limit;
  const page = hasMore ? fetched.slice(0, options.limit) : fetched;
  const items = page.map(toRecord);
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last ? encodeCursor(last.transactionDate, last.id) : null;

  return { items, nextCursor, total };
}

async function update(
  userId: string | Types.ObjectId,
  id: string | Types.ObjectId,
  update: TransactionUpdateRecord,
  editedBy: string | Types.ObjectId,
): Promise<TransactionRecord | null> {
  const set: Record<string, unknown> = {
    editedAt: new Date(),
    editedBy,
  };
  if (update.type !== undefined) set.type = update.type;
  if (update.status !== undefined) set.status = update.status;
  if (update.direction !== undefined) set.direction = update.direction;
  if (update.amountMinor !== undefined) set.amountMinor = update.amountMinor;
  if (update.currency !== undefined) set.currency = update.currency;
  if (update.transactionDate !== undefined) {
    set.transactionDate = update.transactionDate;
  }
  if (update.merchant !== undefined) set.merchant = update.merchant;
  if (update.counterparty !== undefined) set.counterparty = update.counterparty;
  if (update.note !== undefined) set.note = update.note;
  if (update.tags !== undefined) set.tags = update.tags;
  if (update.categoryId !== undefined) {
    set.categoryId = update.categoryId ?? null;
  }
  if (update.paymentMethodId !== undefined) {
    set.paymentMethodId = update.paymentMethodId ?? null;
  }
  if (update.accountRef !== undefined) set.accountRef = update.accountRef;
  if (update.fingerprint !== undefined) set.fingerprint = update.fingerprint;

  const doc = await TransactionModel.findOneAndUpdate(
    { _id: id, userId, deletedAt: null },
    { $set: set, $inc: { editedCount: 1, rev: 1 } },
    { new: true },
  ).exec();
  return doc ? toRecord(doc) : null;
}

async function softDelete(
  userId: string | Types.ObjectId,
  id: string | Types.ObjectId,
  deletedBy: string | Types.ObjectId,
): Promise<TransactionRecord | null> {
  const doc = await TransactionModel.findOneAndUpdate(
    { _id: id, userId, deletedAt: null },
    { $set: { deletedAt: new Date(), deletedBy }, $inc: { rev: 1 } },
    { new: true },
  ).exec();
  return doc ? toRecord(doc) : null;
}

export const transactionRepository = createTransactionRepository();
