export const SYNC_ENTITIES = [
  "transactions",
  "categories",
  "payment-methods",
  "settings",
] as const;

export type SyncEntity = (typeof SYNC_ENTITIES)[number];

export const SYNC_OPS = ["create", "update", "delete"] as const;
export type SyncOp = (typeof SYNC_OPS)[number];

export const SYNC_PUSH_STATUSES = [
  "applied",
  "duplicate",
  "conflict",
  "rejected",
] as const;
export type SyncPushStatus = (typeof SYNC_PUSH_STATUSES)[number];

export interface SyncChange {
  id: string;
  clientId?: string;
  entity: SyncEntity;
  rev: number;
  updatedAt: string;
  deletedAt?: string | null;
  deleted?: boolean;
  /** "upsert" for live docs, "delete" for tombstones. */
  changeType: "upsert" | "delete";
  payload: Record<string, unknown> | null;
}

export interface SyncChangesResult {
  itemsByEntity: Partial<Record<SyncEntity, SyncChange[]>>;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface SyncPushOp {
  entity: SyncEntity;
  op: SyncOp;
  clientId: string;
  id?: string;
  baseRev?: number | null;
  idempotencyKey?: string;
  payload: Record<string, unknown>;
}

export interface SyncPushResultItem {
  status: SyncPushStatus;
  op: SyncOp;
  entity: SyncEntity;
  clientId: string;
  id?: string;
  /** Canonical document (or tombstone payload for deletes). */
  canonical?: Record<string, unknown> | null;
  conflict?: boolean;
  reason?: string;
}

export interface SyncPushResult {
  results: SyncPushResultItem[];
}

export interface SyncStateRecord {
  entity: SyncEntity;
  lastCursor: string | null;
  lastSyncAt: string | null;
  opsProcessed: number;
  state: "idle" | "syncing" | "error";
}

export interface SyncStateResult {
  records: SyncStateRecord[];
}
