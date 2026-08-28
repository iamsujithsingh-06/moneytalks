import { Types } from "mongoose";
import {
  CategoryModel,
  type CategoryDocumentFields,
} from "../../db/models/category.js";

export interface NewCategoryRecord {
  userId: Types.ObjectId | string;
  clientId: string;
  name: string;
  type: string;
  icon?: string | null;
  color?: string | null;
  parentId?: Types.ObjectId | string | null;
  sortOrder: number;
  isPreset?: boolean;
  isDefault?: boolean;
  status?: string;
}

export interface CategoryRecord {
  id: string;
  userId: string;
  clientId: string;
  name: string;
  type: string;
  icon: string | null;
  color: string | null;
  parentId: string | null;
  sortOrder: number;
  isPreset: boolean;
  isDefault: boolean;
  status: string;
  deletedAt: Date | null;
  deletedBy: string | null;
  rev: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CategoryUpdateRecord {
  name?: string;
  icon?: string | null;
  color?: string | null;
  parentId?: Types.ObjectId | string | null;
  sortOrder?: number;
  status?: string;
  isDefault?: boolean;
}

export interface CategoryListFilter {
  type?: string;
}

export interface CategoryRepository {
  create(input: NewCategoryRecord): Promise<CategoryRecord>;
  findById(
    userId: string | Types.ObjectId,
    id: string | Types.ObjectId,
  ): Promise<CategoryRecord | null>;
  findActiveById(
    userId: string | Types.ObjectId,
    id: string | Types.ObjectId,
  ): Promise<CategoryRecord | null>;
  findByClientId(
    userId: string | Types.ObjectId,
    clientId: string,
  ): Promise<CategoryRecord | null>;
  findByNameAndType(
    userId: string | Types.ObjectId,
    name: string,
    type: string,
  ): Promise<CategoryRecord | null>;
  findDefaultByType(
    userId: string | Types.ObjectId,
    type: string,
  ): Promise<CategoryRecord | null>;
  listByUser(
    userId: string | Types.ObjectId,
    filter?: CategoryListFilter,
  ): Promise<CategoryRecord[]>;
  maxSortOrder(
    userId: string | Types.ObjectId,
    type: string,
  ): Promise<number>;
  update(
    userId: string | Types.ObjectId,
    id: string | Types.ObjectId,
    update: CategoryUpdateRecord,
  ): Promise<CategoryRecord | null>;
  softDelete(
    userId: string | Types.ObjectId,
    id: string | Types.ObjectId,
    deletedBy: string | Types.ObjectId,
  ): Promise<CategoryRecord | null>;
  resetDefaults(
    userId: string | Types.ObjectId,
    type: string,
  ): Promise<void>;
  clearParent(
    userId: string | Types.ObjectId,
    parentId: string | Types.ObjectId,
  ): Promise<void>;
}

type CategoryDoc = CategoryDocumentFields & { _id: Types.ObjectId };

function toRecord(doc: CategoryDoc): CategoryRecord {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    clientId: doc.clientId,
    name: doc.name,
    type: doc.type,
    icon: doc.icon ?? null,
    color: doc.color ?? null,
    parentId: doc.parentId ? doc.parentId.toString() : null,
    sortOrder: doc.sortOrder ?? 0,
    isPreset: doc.isPreset ?? false,
    isDefault: doc.isDefault ?? false,
    status: doc.status ?? "active",
    deletedAt: doc.deletedAt ?? null,
    deletedBy: doc.deletedBy ? doc.deletedBy.toString() : null,
    rev: doc.rev ?? 0,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function createCategoryRepository(): CategoryRepository {
  async function create(input: NewCategoryRecord) {
    const doc = await CategoryModel.create({
      userId: input.userId,
      clientId: input.clientId,
      name: input.name,
      type: input.type,
      icon: input.icon ?? null,
      color: input.color ?? null,
      parentId: input.parentId ?? null,
      sortOrder: input.sortOrder,
      isPreset: input.isPreset ?? false,
      isDefault: input.isDefault ?? false,
      status: input.status ?? "active",
    });
    return toRecord(doc);
  }

  async function findById(
    userId: string | Types.ObjectId,
    id: string | Types.ObjectId,
  ) {
    const doc = await CategoryModel.findOne({ _id: id, userId }).exec();
    return doc ? toRecord(doc) : null;
  }

  async function findActiveById(
    userId: string | Types.ObjectId,
    id: string | Types.ObjectId,
  ) {
    const doc = await CategoryModel.findOne({
      _id: id,
      userId,
      deletedAt: null,
    }).exec();
    return doc ? toRecord(doc) : null;
  }

  async function findByNameAndType(
    userId: string | Types.ObjectId,
    name: string,
    type: string,
  ) {
    const doc = await CategoryModel.findOne({
      userId,
      name,
      type,
      deletedAt: null,
    }).exec();
    return doc ? toRecord(doc) : null;
  }

  async function findByClientId(
    userId: string | Types.ObjectId,
    clientId: string,
  ) {
    const doc = await CategoryModel.findOne({ userId, clientId }).exec();
    return doc ? toRecord(doc) : null;
  }

  async function findDefaultByType(
    userId: string | Types.ObjectId,
    type: string,
  ) {
    const doc = await CategoryModel.findOne({
      userId,
      type,
      deletedAt: null,
      isDefault: true,
    }).exec();
    return doc ? toRecord(doc) : null;
  }

  async function listByUser(
    userId: string | Types.ObjectId,
    filter: CategoryListFilter = {},
  ) {
    const query: Record<string, unknown> = { userId };
    if (filter.type) query.type = filter.type;
    const docs = await CategoryModel.find(query)
      .sort({ type: 1, sortOrder: 1, _id: 1 })
      .exec();
    return docs.map(toRecord);
  }

  async function maxSortOrder(
    userId: string | Types.ObjectId,
    type: string,
  ) {
    const doc = await CategoryModel.findOne({ userId, type })
      .sort({ sortOrder: -1 })
      .exec();
    return doc ? doc.sortOrder : 0;
  }

  async function update(
    userId: string | Types.ObjectId,
    id: string | Types.ObjectId,
    update: CategoryUpdateRecord,
  ) {
    const set: Record<string, unknown> = {};
    if (update.name !== undefined) set.name = update.name;
    if (update.icon !== undefined) set.icon = update.icon ?? null;
    if (update.color !== undefined) set.color = update.color ?? null;
    if (update.parentId !== undefined) set.parentId = update.parentId ?? null;
    if (update.sortOrder !== undefined) set.sortOrder = update.sortOrder;
    if (update.status !== undefined) set.status = update.status;
    if (update.isDefault !== undefined) set.isDefault = update.isDefault;

    const doc = await CategoryModel.findOneAndUpdate(
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
    const doc = await CategoryModel.findOneAndUpdate(
      { _id: id, userId, deletedAt: null },
      {
        $set: { deletedAt: new Date(), deletedBy, isDefault: false },
        $inc: { rev: 1 },
      },
      { new: true },
    ).exec();
    return doc ? toRecord(doc) : null;
  }

  async function resetDefaults(
    userId: string | Types.ObjectId,
    type: string,
  ) {
    await CategoryModel.updateMany(
      { userId, type, deletedAt: null },
      { $set: { isDefault: false } },
    ).exec();
  }

  async function clearParent(
    userId: string | Types.ObjectId,
    parentId: string | Types.ObjectId,
  ) {
    await CategoryModel.updateMany(
      { userId, parentId },
      { $set: { parentId: null } },
    ).exec();
  }

  return {
    create,
    findById,
    findActiveById,
    findByClientId,
    findByNameAndType,
    findDefaultByType,
    listByUser,
    maxSortOrder,
    update,
    softDelete,
    resetDefaults,
    clearParent,
  };
}

export const categoryRepository = createCategoryRepository();
