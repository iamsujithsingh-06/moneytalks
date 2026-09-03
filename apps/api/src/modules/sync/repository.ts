import { Types } from "mongoose";
import type { SyncEntity } from "@moneytalks/types";
import { TransactionModel } from "../../db/models/transaction.js";
import { CategoryModel } from "../../db/models/category.js";
import { PaymentMethodModel } from "../../db/models/payment-method.js";
import { SettingsModel } from "../../db/models/settings.js";
import { SyncRecordModel } from "../../db/models/sync-record.js";

export interface Cursor {
  date: Date;
  id: Types.ObjectId;
}

export interface PullDoc {
  id: string;
  clientId: string;
  rev: number;
  updatedAt: Date;
  deletedAt: Date | null;
  /** Raw lean document for serialization, scoped to the user. */
  doc: Record<string, unknown>;
}

export interface PullPage {
  items: PullDoc[];
  hasMore: boolean;
}

export interface SyncRecordState {
  entity: SyncEntity;
  lastCursor: string | null;
  lastSyncAt: Date | null;
  opsProcessed: number;
  state: "idle" | "syncing" | "error";
}

export interface SyncRepository {
  pull(
    userId: string | Types.ObjectId,
    entity: SyncEntity,
    cursor: Cursor | null,
    limit: number,
  ): Promise<PullPage>;
  getSyncState(
    userId: string | Types.ObjectId,
    deviceId: string,
    entity: SyncEntity,
  ): Promise<SyncRecordState | null>;
  listSyncState(
    userId: string | Types.ObjectId,
    deviceId: string,
    entities: SyncEntity[],
  ): Promise<SyncRecordState[]>;
  saveCursor(
    userId: string | Types.ObjectId,
    deviceId: string,
    entity: SyncEntity,
    cursor: string | null,
    opts?: { opsProcessed?: number; state?: SyncRecordState["state"] },
  ): Promise<void>;
}

function parseCursor(raw: string): Cursor | null {
  let text: string;
  try {
    text = Buffer.from(raw, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const separator = text.lastIndexOf("::");
  if (separator <= 0) return null;
  const date = new Date(text.slice(0, separator));
  const id = text.slice(separator + 2);
  if (Number.isNaN(date.getTime()) || !/^[0-9a-f]{24}$/.test(id)) {
    return null;
  }
  return { date, id: new Types.ObjectId(id) };
}

function encodeCursor(date: Date, id: string): string {
  return Buffer.from(`${date.toISOString()}::${id}`, "utf8").toString(
    "base64url",
  );
}

function makePage(
  docs: Array<Record<string, unknown>>,
  idField: string,
  clientIdField: string,
  revField: string,
  updatedAtField: string,
  deletedAtField: string,
  limit: number,
): PullPage {
  const hasMore = docs.length > limit;
  const page = hasMore ? docs.slice(0, limit) : docs;
  const items: PullDoc[] = [];
  for (const doc of page) {
    const id = String(doc[idField]);
    const updatedAtRaw = doc[updatedAtField];
    const deletedAtRaw = doc[deletedAtField] as Date | null | undefined;
    items.push({
      id,
      clientId: String(doc[clientIdField] ?? ""),
      rev: (doc[revField] as number) ?? 0,
      updatedAt: normalizedDate(updatedAtRaw),
      deletedAt: deletedAtRaw ? normalizedDate(deletedAtRaw) : null,
      doc,
    });
  }
  return { items, hasMore };
}

function normalizedDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return new Date();
    return d;
  }
  return new Date();
}

function keysetFilter(cursor: Cursor | null) {
  if (!cursor) return {};
  const { date, id } = cursor;
  return {
    $or: [
      { updatedAt: { $gt: date } },
      { updatedAt: date, _id: { $gt: id } },
    ],
  };
}

export function createSyncRepository(): SyncRepository {
  async function pull(
    userId: string | Types.ObjectId,
    entity: SyncEntity,
    cursor: Cursor | null,
    limit: number,
  ): Promise<PullPage> {
    const filter = { userId, ...keysetFilter(cursor) };
    const sort = { updatedAt: 1, _id: 1 } as const;

    switch (entity) {
      case "transactions": {
        const docs = await TransactionModel.find(filter as never)
          .sort(sort)
          .limit(limit + 1)
          .lean()
          .exec();
        return makePage(docs as never[], "_id", "clientId", "rev", "updatedAt", "deletedAt", limit);
      }
      case "categories": {
        const docs = await CategoryModel.find(filter as never)
          .sort(sort)
          .limit(limit + 1)
          .lean()
          .exec();
        return makePage(docs as never[], "_id", "clientId", "rev", "updatedAt", "deletedAt", limit);
      }
      case "payment-methods": {
        const docs = await PaymentMethodModel.find(filter as never)
          .sort(sort)
          .limit(limit + 1)
          .lean()
          .exec();
        return makePage(docs as never[], "_id", "clientId", "rev", "updatedAt", "deletedAt", limit);
      }
      case "settings": {
        const docs = await SettingsModel.find(filter as never)
          .sort(sort)
          .limit(limit + 1)
          .lean()
          .exec();
        return makePage(docs as never[], "_id", "clientId", "rev", "updatedAt", "deletedAt", limit);
      }
    }
  }

  async function getSyncState(
    userId: string | Types.ObjectId,
    deviceId: string,
    entity: SyncEntity,
  ): Promise<SyncRecordState | null> {
    const doc = await SyncRecordModel.findOne({ userId, deviceId, entity })
      .lean()
      .exec();
    if (!doc) return null;
    return {
      entity: doc.entity as SyncEntity,
      lastCursor: doc.lastCursor,
      lastSyncAt: doc.lastSyncAt,
      opsProcessed: doc.opsProcessed,
      state: doc.state,
    };
  }

  async function listSyncState(
    userId: string | Types.ObjectId,
    deviceId: string,
    entities: SyncEntity[],
  ): Promise<SyncRecordState[]> {
    const docs = await SyncRecordModel.find({
      userId,
      deviceId,
      entity: { $in: entities },
    })
      .lean()
      .exec();
    return docs.map((doc) => ({
      entity: doc.entity as SyncEntity,
      lastCursor: doc.lastCursor,
      lastSyncAt: doc.lastSyncAt,
      opsProcessed: doc.opsProcessed,
      state: doc.state,
    }));
  }

  async function saveCursor(
    userId: string | Types.ObjectId,
    deviceId: string,
    entity: SyncEntity,
    cursor: string | null,
    opts: { opsProcessed?: number; state?: SyncRecordState["state"] } = {},
  ): Promise<void> {
    const update: Record<string, unknown> = {
      lastCursor: cursor,
      lastSyncAt: new Date(),
    };
    const setOnInsert: Record<string, unknown> = {};
    // Avoid putting the same path in both $set and $setOnInsert, which MongoDB
    // rejects as a path conflict.
    if (opts.opsProcessed !== undefined) {
      update.opsProcessed = opts.opsProcessed;
    } else {
      setOnInsert.opsProcessed = 0;
    }
    if (opts.state !== undefined) {
      update.state = opts.state;
    } else {
      setOnInsert.state = "idle";
    }
    const patch: Record<string, unknown> = { $set: update };
    if (Object.keys(setOnInsert).length > 0) {
      patch.$setOnInsert = setOnInsert;
    }
    await SyncRecordModel.updateOne(
      { userId, deviceId, entity },
      patch,
      { upsert: true },
    ).exec();
  }

  return {
    pull,
    getSyncState,
    listSyncState,
    saveCursor,
  };
}

export { parseCursor, encodeCursor };
