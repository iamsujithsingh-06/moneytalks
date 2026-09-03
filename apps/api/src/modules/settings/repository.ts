import { Types } from "mongoose";
import {
  SettingsModel,
  type SettingsDocumentFields,
} from "../../db/models/settings.js";

export interface NewSettingsRecord {
  userId: Types.ObjectId | string;
  clientId: string;
  initialBalanceMinor: number;
}

export interface SettingsRecord {
  id: string;
  userId: string;
  clientId: string;
  initialBalanceMinor: number;
  deletedAt: Date | null;
  deletedBy: string | null;
  rev: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SettingsUpdateRecord {
  initialBalanceMinor?: number;
}

export interface SettingsRepository {
  create(input: NewSettingsRecord): Promise<SettingsRecord>;
  findByClientId(
    userId: string | Types.ObjectId,
    clientId: string,
  ): Promise<SettingsRecord | null>;
  findByUser(
    userId: string | Types.ObjectId,
  ): Promise<SettingsRecord | null>;
  update(
    userId: string | Types.ObjectId,
    id: string | Types.ObjectId,
    update: SettingsUpdateRecord,
  ): Promise<SettingsRecord | null>;
  softDelete(
    userId: string | Types.ObjectId,
    id: string | Types.ObjectId,
    deletedBy: string | Types.ObjectId,
  ): Promise<SettingsRecord | null>;
  getInitialBalanceMinor(
    userId: string | Types.ObjectId,
  ): Promise<number>;
}

type SettingsDoc = SettingsDocumentFields & {
  _id: Types.ObjectId;
};

function toRecord(doc: SettingsDoc): SettingsRecord {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    clientId: doc.clientId,
    initialBalanceMinor: doc.initialBalanceMinor ?? 0,
    deletedAt: doc.deletedAt ?? null,
    deletedBy: doc.deletedBy ? doc.deletedBy.toString() : null,
    rev: doc.rev ?? 0,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function createSettingsRepository(): SettingsRepository {
  async function create(input: NewSettingsRecord) {
    const doc = await SettingsModel.create({
      userId: input.userId,
      clientId: input.clientId,
      initialBalanceMinor: input.initialBalanceMinor ?? 0,
    });
    return toRecord(doc);
  }

  async function findByClientId(
    userId: string | Types.ObjectId,
    clientId: string,
  ) {
    const doc = await SettingsModel.findOne({ userId, clientId }).exec();
    return doc ? toRecord(doc) : null;
  }

  async function findByUser(userId: string | Types.ObjectId) {
    const doc = await SettingsModel.findOne({ userId, deletedAt: null })
      .sort({ updatedAt: -1, _id: -1 })
      .exec();
    return doc ? toRecord(doc) : null;
  }

  async function update(
    userId: string | Types.ObjectId,
    id: string | Types.ObjectId,
    update: SettingsUpdateRecord,
  ) {
    const set: Record<string, unknown> = {};
    if (update.initialBalanceMinor !== undefined) {
      set.initialBalanceMinor = update.initialBalanceMinor;
    }
    const doc = await SettingsModel.findOneAndUpdate(
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
    const doc = await SettingsModel.findOneAndUpdate(
      { _id: id, userId, deletedAt: null },
      { $set: { deletedAt: new Date(), deletedBy }, $inc: { rev: 1 } },
      { new: true },
    ).exec();
    return doc ? toRecord(doc) : null;
  }

  async function getInitialBalanceMinor(
    userId: string | Types.ObjectId,
  ): Promise<number> {
    const record = await findByUser(userId);
    return record?.initialBalanceMinor ?? 0;
  }

  return {
    create,
    findByClientId,
    findByUser,
    update,
    softDelete,
    getInitialBalanceMinor,
  };
}

export const settingsRepository = createSettingsRepository();
