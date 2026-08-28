import type {
  CategoryPublic,
  PaymentMethodPublic,
  SyncEntity,
  TransactionPublic,
} from "@moneytalks/types";
import { newClientId } from "../constants.js";
import type { EntityRecord } from "./db.js";
import {
  deleteEntityRecord,
  enqueueOp,
  getAllEntities,
  getEntity,
  getEntityById,
  getPendingOps,
  putEntity,
  setMeta,
  setOpStatus,
} from "./db.js";

export type EntityDoc<T extends SyncEntity> = T extends "transactions"
  ? TransactionPublic
  : T extends "categories"
    ? CategoryPublic
    : PaymentMethodPublic;

type CommonDoc = {
  id: string;
  clientId: string;
  rev: number;
  updatedAt: string;
  createdAt: string;
  deleted?: boolean;
  deletedAt?: string | null;
};

const SYNCABLE: SyncEntity[] = ["transactions", "categories", "payment-methods"];

function stripUndefined(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function toRecord(doc: object): Record<string, unknown> {
  return stripUndefined({ ...(doc as Record<string, unknown>) });
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Offline-first data access. Writes are atomic with outbox enqueue and return
 * optimistic local documents immediately (read-your-writes). Reads come from
 * IndexedDB, so the UI keeps working without connectivity.
 */
export const offlineStore = {
  isOfflineEntity(entity: string): entity is SyncEntity {
    return (SYNCABLE as string[]).includes(entity);
  },

  async get<T extends SyncEntity>(entity: T, clientId: string): Promise<EntityDoc<T> | null> {
    const rec = await getEntity(clientId);
    if (!rec || rec.entity !== entity) return null;
    return (rec.payload as unknown as EntityDoc<T>) ?? null;
  },

  async getById<T extends SyncEntity>(
    entity: T,
    id: string,
  ): Promise<EntityDoc<T> | null> {
    const rec = await getEntityById(entity, id);
    if (!rec) return null;
    return (rec.payload as unknown as EntityDoc<T>) ?? null;
  },

  async list<T extends SyncEntity>(entity: T): Promise<EntityDoc<T>[]> {
    const records = await getAllEntities(entity);
    return records
      .filter((r) => !r.deleted)
      .map((r) => r.payload as unknown as EntityDoc<T>)
      .sort((a, b) => {
        const cmp = String(b.updatedAt).localeCompare(String(a.updatedAt));
        return cmp !== 0 ? cmp : String(a.id).localeCompare(String(b.id));
      });
  },

  async create<T extends SyncEntity>(
    entity: T,
    input: Record<string, unknown>,
  ): Promise<{ doc: EntityDoc<T>; clientId: string }> {
    const clientId = (input.clientId as string) ?? newClientId();
    const now = nowIso();
    const doc = {
      ...stripUndefined(input),
      id: (input.id as string) ?? "",
      clientId,
      rev: 0,
      updatedAt: now,
      createdAt: (input.createdAt as string) ?? now,
    } as unknown as EntityDoc<T>;

    await putEntity({
      entity,
      clientId,
      id: (doc as CommonDoc).id,
      rev: (doc as CommonDoc).rev,
      updatedAt: (doc as CommonDoc).updatedAt,
      payload: toRecord(doc),
      baseRev: null,
      localDirty: toRecord(doc),
    });

    await enqueueOp({
      entity,
      op: "create",
      clientId,
      id: (doc as CommonDoc).id || undefined,
      baseRev: null,
      payload: toRecord(doc),
      idempotencyKey: clientId,
      createdAt: now,
      attempt: 0,
      status: "pending",
    });

    return { doc, clientId };
  },

  async update<T extends SyncEntity>(
    entity: T,
    clientId: string,
    patch: Record<string, unknown>,
  ): Promise<EntityDoc<T> | null> {
    const rec = await getEntity(clientId);
    if (!rec || rec.entity !== entity || rec.deleted) return null;

    const current = rec.payload as Record<string, unknown>;
    const merged = { ...current, ...stripUndefined(patch), clientId };
    const now = nowIso();
    const localDirty = { ...(rec.localDirty ?? {}), ...stripUndefined(patch) };
    const base = { ...current, ...stripUndefined(patch), clientId, updatedAt: now };

    await putEntity({
      ...rec,
      payload: merged,
      localDirty,
      updatedAt: now,
    });

    await enqueueOp({
      entity,
      op: "update",
      clientId,
      id: rec.id,
      baseRev: rec.baseRev ?? rec.rev ?? null,
      payload: toRecord(base),
      createdAt: nowIso(),
      attempt: 0,
      status: "pending",
    });

    return merged as unknown as EntityDoc<T>;
  },

  async remove<T extends SyncEntity>(entity: T, clientId: string): Promise<void> {
    const rec = await getEntity(clientId);
    if (!rec || rec.entity !== entity) return;

    const now = nowIso();
    await putEntity({
      ...rec,
      deleted: true,
      deletedAt: now,
      updatedAt: now,
    });

    await enqueueOp({
      entity,
      op: "delete",
      clientId,
      id: rec.id,
      baseRev: rec.baseRev ?? rec.rev ?? null,
      payload: {},
      idempotencyKey: newClientId(),
      createdAt: nowIso(),
      attempt: 0,
      status: "pending",
    });
  },

  async pendingCount(): Promise<number> {
    const ops = await getPendingOps();
    return ops.length;
  },

  async dirtyCounts(): Promise<Partial<Record<SyncEntity, number>>> {
    const ops = await getPendingOps();
    const counts: Partial<Record<SyncEntity, number>> = {};
    for (const op of ops) {
      counts[op.entity] = (counts[op.entity] ?? 0) + 1;
    }
    return counts;
  },

  async touchLastSyncAt(at?: string): Promise<void> {
    await setMeta("lastSyncAt", at ?? nowIso());
  },

  /** Rebuild local records from canonical server docs (bootstrap / pull). */
  async hydrateFromServer(
    entity: SyncEntity,
    docs: Array<EntityDoc<SyncEntity> & { clientId: string }>,
    mode: "bootstrap" | "merge",
  ): Promise<void> {
    for (const doc of docs) {
      const common = doc as CommonDoc;
      if (mode === "merge") {
        const existing = await getEntityById(entity, common.id);
        if (existing && existing.localDirty && Object.keys(existing.localDirty).length > 0) {
          continue;
        }
      }
      if (common.deleted || common.deletedAt) {
        await tombstone(entity, common, doc);
        continue;
      }
      await putEntity({
        entity,
        clientId: common.clientId,
        id: common.id,
        rev: common.rev,
        updatedAt: common.updatedAt,
        deleted: false,
        deletedAt: null,
        payload: toRecord(doc),
        baseRev: common.rev,
      });
    }
  },

  async purgeDeletedLocal(clientId: string): Promise<void> {
    await deleteEntityRecord(clientId);
  },

  async markOutboxSynced(seq: number): Promise<void> {
    await setOpStatus(seq, "synced");
  },

  async markOutboxFailed(seq: number): Promise<void> {
    await setOpStatus(seq, "failed");
  },
};

async function tombstone(
  entity: SyncEntity,
  common: CommonDoc,
  doc: EntityDoc<SyncEntity> & { clientId: string },
): Promise<void> {
  const rec = await getEntityById(entity, common.id);
  if (!rec) {
    const record: EntityRecord = {
      entity,
      clientId: common.clientId,
      id: common.id,
      rev: common.rev,
      updatedAt: common.updatedAt,
      deleted: true,
      deletedAt: common.deletedAt ?? null,
      payload: toRecord(doc),
      baseRev: common.rev,
    };
    await putEntity(record);
    return;
  }
  for (const key of Object.keys(rec.payload ?? {})) {
    delete rec.payload[key];
  }
  await putEntity({
    ...rec,
    deleted: true,
    deletedAt: common.deletedAt ?? rec.deletedAt ?? null,
    updatedAt: common.updatedAt,
    rev: common.rev,
  });
}

export type { EntityRecord };
