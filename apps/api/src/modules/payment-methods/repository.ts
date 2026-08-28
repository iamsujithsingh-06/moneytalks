import { Types } from "mongoose";
import {
  PaymentMethodModel,
  type PaymentMethodDocumentFields,
} from "../../db/models/payment-method.js";

export interface NewPaymentMethodRecord {
  userId: Types.ObjectId | string;
  clientId: string;
  name: string;
  kind: string;
  provider?: string | null;
  maskedNumber?: string | null;
  accountRef?: string | null;
  isDefault?: boolean;
  status?: string;
}

export interface PaymentMethodRecord {
  id: string;
  userId: string;
  clientId: string;
  name: string;
  kind: string;
  provider: string | null;
  maskedNumber: string | null;
  accountRef: string | null;
  isDefault: boolean;
  status: string;
  deletedAt: Date | null;
  deletedBy: string | null;
  rev: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentMethodUpdateRecord {
  name?: string;
  provider?: string | null;
  maskedNumber?: string | null;
  accountRef?: string | null;
  isDefault?: boolean;
  status?: string;
}

export interface PaymentMethodListFilter {
  kind?: string;
}

export interface PaymentMethodRepository {
  create(input: NewPaymentMethodRecord): Promise<PaymentMethodRecord>;
  findById(
    userId: string | Types.ObjectId,
    id: string | Types.ObjectId,
  ): Promise<PaymentMethodRecord | null>;
  findActiveById(
    userId: string | Types.ObjectId,
    id: string | Types.ObjectId,
  ): Promise<PaymentMethodRecord | null>;
  findByNameAndKind(
    userId: string | Types.ObjectId,
    name: string,
    kind: string,
  ): Promise<PaymentMethodRecord | null>;
  findDefault(
    userId: string | Types.ObjectId,
  ): Promise<PaymentMethodRecord | null>;
  listByUser(
    userId: string | Types.ObjectId,
    filter?: PaymentMethodListFilter,
  ): Promise<PaymentMethodRecord[]>;
  update(
    userId: string | Types.ObjectId,
    id: string | Types.ObjectId,
    update: PaymentMethodUpdateRecord,
  ): Promise<PaymentMethodRecord | null>;
  softDelete(
    userId: string | Types.ObjectId,
    id: string | Types.ObjectId,
    deletedBy: string | Types.ObjectId,
  ): Promise<PaymentMethodRecord | null>;
  resetDefault(userId: string | Types.ObjectId): Promise<void>;
}

type PaymentMethodDoc = PaymentMethodDocumentFields & {
  _id: Types.ObjectId;
};

function toRecord(doc: PaymentMethodDoc): PaymentMethodRecord {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    clientId: doc.clientId,
    name: doc.name,
    kind: doc.kind,
    provider: doc.provider ?? null,
    maskedNumber: doc.maskedNumber ?? null,
    accountRef: doc.accountRef ?? null,
    isDefault: doc.isDefault ?? false,
    status: doc.status ?? "active",
    deletedAt: doc.deletedAt ?? null,
    deletedBy: doc.deletedBy ? doc.deletedBy.toString() : null,
    rev: doc.rev ?? 0,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function createPaymentMethodRepository(): PaymentMethodRepository {
  async function create(input: NewPaymentMethodRecord) {
    const doc = await PaymentMethodModel.create({
      userId: input.userId,
      clientId: input.clientId,
      name: input.name,
      kind: input.kind,
      provider: input.provider ?? null,
      maskedNumber: input.maskedNumber ?? null,
      accountRef: input.accountRef ?? null,
      isDefault: input.isDefault ?? false,
      status: input.status ?? "active",
    });
    return toRecord(doc);
  }

  async function findById(
    userId: string | Types.ObjectId,
    id: string | Types.ObjectId,
  ) {
    const doc = await PaymentMethodModel.findOne({ _id: id, userId }).exec();
    return doc ? toRecord(doc) : null;
  }

  async function findActiveById(
    userId: string | Types.ObjectId,
    id: string | Types.ObjectId,
  ) {
    const doc = await PaymentMethodModel.findOne({
      _id: id,
      userId,
      deletedAt: null,
    }).exec();
    return doc ? toRecord(doc) : null;
  }

  async function findByNameAndKind(
    userId: string | Types.ObjectId,
    name: string,
    kind: string,
  ) {
    const doc = await PaymentMethodModel.findOne({
      userId,
      name,
      kind,
      deletedAt: null,
    }).exec();
    return doc ? toRecord(doc) : null;
  }

  async function findDefault(userId: string | Types.ObjectId) {
    const doc = await PaymentMethodModel.findOne({
      userId,
      deletedAt: null,
      isDefault: true,
    }).exec();
    return doc ? toRecord(doc) : null;
  }

  async function listByUser(
    userId: string | Types.ObjectId,
    filter: PaymentMethodListFilter = {},
  ) {
    const query: Record<string, unknown> = { userId };
    if (filter.kind) query.kind = filter.kind;
    const docs = await PaymentMethodModel.find(query)
      .sort({ createdAt: 1, _id: 1 })
      .exec();
    return docs.map(toRecord);
  }

  async function update(
    userId: string | Types.ObjectId,
    id: string | Types.ObjectId,
    update: PaymentMethodUpdateRecord,
  ) {
    const set: Record<string, unknown> = {};
    if (update.name !== undefined) set.name = update.name;
    if (update.provider !== undefined) set.provider = update.provider ?? null;
    if (update.maskedNumber !== undefined) {
      set.maskedNumber = update.maskedNumber ?? null;
    }
    if (update.accountRef !== undefined) {
      set.accountRef = update.accountRef ?? null;
    }
    if (update.isDefault !== undefined) set.isDefault = update.isDefault;
    if (update.status !== undefined) set.status = update.status;

    const doc = await PaymentMethodModel.findOneAndUpdate(
      { _id: id, userId, deletedAt: null },
      { $set: set, $inc: { rev: 1 } },
      { new: true },
    ).exec();
    return doc ? toRecord(doc) : null;
  }

  async function softDelete(
    userId: string | Types.ObjectId,
    id: string | Types.ObjectId,
    deletedBy: string | Types.ObjectId,
  ) {
    const doc = await PaymentMethodModel.findOneAndUpdate(
      { _id: id, userId, deletedAt: null },
      {
        $set: { deletedAt: new Date(), deletedBy, isDefault: false },
        $inc: { rev: 1 },
      },
      { new: true },
    ).exec();
    return doc ? toRecord(doc) : null;
  }

  async function resetDefault(userId: string | Types.ObjectId) {
    await PaymentMethodModel.updateMany(
      { userId, deletedAt: null },
      { $set: { isDefault: false } },
    ).exec();
  }

  return {
    create,
    findById,
    findActiveById,
    findByNameAndKind,
    findDefault,
    listByUser,
    update,
    softDelete,
    resetDefault,
  };
}

export const paymentMethodRepository = createPaymentMethodRepository();
