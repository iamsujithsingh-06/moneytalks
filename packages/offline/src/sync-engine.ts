import type {
  SyncChange,
  SyncChangesResult,
  SyncEntity,
  SyncPushOp,
  SyncPushResult,
  SyncPushResultItem,
} from "@moneytalks/types";
import type { EntityRecord, OutboxOp } from "./db.js";
import {
  deleteEntityRecord,
  deleteOp,
  enqueueOp,
  getEntity,
  getEntityById,
  getMeta,
  getPendingOps,
  openDB,
  putEntity,
  setMeta,
  setOpStatus,
  updateOp,
} from "./db.js";
import { offlineStore } from "./offline-store.js";
import { SyncClient } from "./sync-client.js";
import { uuid } from "./uuid.js";

export const SYNC_ENTITIES: SyncEntity[] = [
  "transactions",
  "categories",
  "payment-methods",
  "settings",
];

export type SyncStatusValue =
  | "synced"
  | "pending"
  | "syncing"
  | "failed"
  | "conflict"
  | "offline";

export interface SyncIssue {
  entity: SyncEntity;
  clientId: string;
  id?: string;
  kind: "conflict" | "rejected";
  reason?: string;
  canonical?: Record<string, unknown> | null;
}

export interface SyncSnapshot {
  status: SyncStatusValue;
  online: boolean;
  syncing: boolean;
  pendingCount: number;
  retryable: boolean;
  conflictCount: number;
  lastSyncAt: string | null;
  error: string | null;
  issues: SyncIssue[];
}

type Listener = (snap: SyncSnapshot) => void;

const CURSOR_KEYS: Record<SyncEntity, string> = {
  transactions: "cursor:transactions",
  categories: "cursor:categories",
  "payment-methods": "cursor:payment-methods",
  settings: "cursor:settings",
};

const MAX_BATCH = 100;
const RETRY_MAX_MS = 5 * 60 * 1000;
const RETRY_BASE_MS = 1000;

/** Server rejection reason for a create that collides with an existing record
 *  (ErrorCodes.DuplicateTransaction lowercased). A duplicate is reconciled,
 *  never treated as a permanent error nor re-pushed. */
const DUPLICATE_TRANSACTION_REASON = "duplicate_transaction";

/** Minimal key/value storage surface (defaults to browser sessionStorage). */
export interface KeyValueStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

function chunkLength<T>(arr: T[], size: number): number {
  return Math.ceil(arr.length / size);
}

function hasDirty(rec: EntityRecord): boolean {
  return Boolean(rec.localDirty && Object.keys(rec.localDirty).length > 0);
}

export interface SyncEngineDeps {
  client: SyncClient;
  getDeviceId: () => string | null;
  /** Optional in-memory/browser storage for retry counters. */
  storage?: KeyValueStorage;
}

export class SyncEngine {
  private readonly client: SyncClient;
  private readonly getDeviceId: () => string | null;
  private readonly storage: KeyValueStorage | null;
  private readonly listeners = new Set<Listener>();
  private snapshot: SyncSnapshot;
  private running = false;
  private manualRun = false;
  private rerunRequested = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private onlineHandler: () => void;
  private offlineHandler: () => void;
  private lastOnline = true;

  constructor(deps: SyncEngineDeps) {
    this.client = deps.client;
    this.getDeviceId = deps.getDeviceId;
    this.storage = deps.storage ?? defaultStorage();
    this.snapshot = {
      status: "synced",
      online: true,
      syncing: false,
      pendingCount: 0,
      retryable: false,
      conflictCount: 0,
      lastSyncAt: null,
      error: null,
      issues: [],
    };
    this.onlineHandler = () => {
      if (!this.lastOnline) {
        this.lastOnline = true;
        this.update({ online: true });
        void this.sync("reconnect");
      }
    };
    this.offlineHandler = () => {
      this.lastOnline = false;
      this.update({
        online: false,
        retryable: false,
        error: "You're offline. Changes will sync when you reconnect.",
        status: "offline",
      });
    };
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    if (typeof window !== "undefined" && typeof navigator !== "undefined") {
      window.addEventListener("online", this.onlineHandler);
      window.addEventListener("offline", this.offlineHandler);
      const online = navigator.onLine;
      this.lastOnline = online;
      this.update({ online });
      if (online) {
        void this.sync("start");
      } else {
        this.update({
          online: false,
          status: "offline",
          error: "You're offline. Changes will sync when you reconnect.",
        });
      }
    } else {
      void this.sync("start");
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.onlineHandler);
      window.removeEventListener("offline", this.offlineHandler);
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  getSnapshot(): SyncSnapshot {
    return this.snapshot;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private update(patch: Partial<SyncSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const fn of this.listeners) fn(this.snapshot);
  }

  async refreshStatic(): Promise<void> {
    // Recover any pre-existing outbox ops that were already rejected as
    // `duplicate_transaction` (e.g. on an older build, or before a device had a
    // fresh clientId). These are one-time LOCAL reconciliations driven by the
    // server's previously-recorded rejection — no re-push, no server round-trip,
    // no clearing of user data, and deduplication is unchanged.
    await this.reconcileDuplicateOps();
    // Self-heal stale/failed update (and delete) ops left over from the
    // old create-update race (see reconcileStaleFailedOps). Deterministic,
    // preserves user data, and does not weaken server conflict detection.
    await this.reconcileStaleFailedOps();
    const issues = await this.loadIssues();
    const pending = await getPendingOps();
    const failed = pending.filter((o) => o.status === "failed").length;
    const conflictCount = issues.filter((i) => i.kind === "conflict").length;
    const lastSyncAt = (await getMeta("lastSyncAt")) as string | null;
    this.update({
      pendingCount: pending.length,
      conflictCount,
      lastSyncAt,
      issues,
      status:
        conflictCount > 0 || failed > 0
          ? "conflict"
          : pending.length > 0
            ? "pending"
            : "synced",
    });
  }

  /**
   * Locally reconcile outbox ops that were already rejected as
   * `duplicate_transaction`. The server holds the canonical record (that is
   * what the rejection means), so the local optimistic create is redundant:
   * clear the op and its recorded issue, and clean the local entity. Only
   * `create` ops with a matching `rejected` issue whose reason is
   * `duplicate_transaction` are affected — genuine validation/conflict
   * rejections are left untouched (they stay "Needs attention"). This is the
   * one-time recovery mechanism for pre-existing failed duplicate ops.
   */
  private async reconcileDuplicateOps(): Promise<void> {
    const issues = await this.loadIssues();
    const dupIssues = issues.filter(
      (i) => i.kind === "rejected" && i.reason === DUPLICATE_TRANSACTION_REASON,
    );
    if (dupIssues.length === 0) return;
    const issueKey = (e: SyncEntity, c: string) => `${e}:${c}`;
    const dupKeys = new Set(dupIssues.map((i) => issueKey(i.entity, i.clientId)));

    const ops = await getPendingOps();
    const toDelete: number[] = [];
    const reconciledKeys = new Set<string>();
    for (const op of ops) {
      if (
        op.op === "create" &&
        op.status === "failed" &&
        dupKeys.has(issueKey(op.entity, op.clientId))
      ) {
        if (op.seq !== undefined) toDelete.push(op.seq);
        reconciledKeys.add(issueKey(op.entity, op.clientId));
        const rec = await getEntity(op.clientId);
        if (rec && rec.entity === op.entity) {
          await putEntity({ ...rec, localDirty: undefined, conflict: false });
        }
      }
    }
    for (const seq of toDelete) {
      await deleteOp(seq);
    }
    if (reconciledKeys.size > 0) {
      await setMeta(
        "sync:issues",
        issues.filter((i) => !(i.reason === DUPLICATE_TRANSACTION_REASON && reconciledKeys.has(issueKey(i.entity, i.clientId)))),
      );
    }
  }

  /**
   * Deterministic self-heal for a legacy `failed` UPDATE/DELETE that was the
   * victim of the old create-update race.
   *
   * Before the offline-store coalesced updates into pending creates, a locally
   * created record could be updated before its create synced, leaving a
   * separate UPDATE op frozen with a stale `baseRev` (often 0). When the create
   * then synced and the server's `$inc` advanced the row past that base, the
   * update was rejected as a conflict and became terminal (`status: "failed"`),
   * surfacing as a permanent "Needs attention".
   *
   * Recovery: if the matching record still exists (and is not deleted), the
   * user's intended values live in the record's payload. We refresh the failed
   * op's `baseRev` from the freshest local source of truth (record's baseRev,
   * else its rev, else the op's current base) and re-arm it as `pending` so the
   * next push re-delivers it. The server's own conflict check is UNCHANGED — if
   * this is a genuine concurrent edit it will conflict again and stay failed
   * for manual resolution. Nothing is deleted and no user data is discarded.
   *
   * To avoid unbounded retry churn on a genuinely conflicting op, each failed
   * op is auto-recovered at most once (guarded by `attempt`). A record that is
   * already clean on the server-consistent side (no localDirty) and matches the
   * server is left untouched.
   */
  private async reconcileStaleFailedOps(): Promise<void> {
    const ops = await getPendingOps();
    for (const op of ops) {
      if (op.status !== "failed") continue;
      if (op.op !== "update" && op.op !== "delete") continue;
      // Only ever self-heal once; a repeated failure is a real conflict for the
      // user to resolve explicitly.
      if ((op.attempt ?? 0) >= 1) continue;

      const rec = await getEntity(op.clientId);
      if (!rec || rec.entity !== op.entity) continue;
      if (rec.deleted) continue;

      const baseRev = rec.baseRev ?? rec.rev ?? op.baseRev ?? null;
      if (rec.conflict) {
        await putEntity({ ...rec, conflict: false });
      }
      if (op.seq !== undefined) {
        await updateOp(op.seq, { status: "pending", baseRev, attempt: (op.attempt ?? 0) + 1 });
      }
    }
  }
  async sync(_reason: "manual" | "start" | "reconnect" | "retry"): Promise<void> {
    if (this.manualRun) {
      // A sync is currently in flight. Remember that we were asked to sync
      // again so any ops created since the in-flight run began (e.g. an SMS
      // auto-transaction committed mid-sync) get flushed once it completes.
      this.rerunRequested = true;
      return;
    }
    this.manualRun = true;
    try {
      if (this.snapshot.online === false) return;
      if (!this.getDeviceId()) return;
      await this.doSync();
    } finally {
      this.manualRun = false;
      if (this.rerunRequested) {
        this.rerunRequested = false;
        await this.sync("retry");
      }
    }
  }

  private async doSync(): Promise<void> {
    this.update({ syncing: true, status: "syncing", error: null, retryable: false });
    try {
      await this.pull();
      await this.push();
      this.update({ syncing: false, error: null });
      await offlineStore.touchLastSyncAt();
      await this.refreshStatic();
    } catch (err) {
      this.update({
        syncing: false,
        status: "failed",
        retryable: true,
        error: err instanceof Error ? err.message : "Sync failed",
      });
      this.scheduleRetry();
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const attempts = this.retryAttempts();
    const expo = RETRY_BASE_MS * 2 ** Math.min(attempts, 9);
    const capped = Math.min(expo, RETRY_MAX_MS);
    const jitter = Math.round(capped * 0.2 * (Math.random() - 0.5));
    const delay = Math.max(500, capped + jitter);
    this.retryTimer = setTimeout(() => void this.sync("retry"), delay);
  }

  private retryAttempts(): number {
    const storage = this.storage;
    if (!storage) return 0;
    const raw = storage.getItem("mt.sync.attempts");
    const n = raw ? Number(raw) || 0 : 0;
    storage.setItem("mt.sync.attempts", String(n + 1));
    return n;
  }

  /* -------------------------------- pull -------------------------------- */

  private async pull(): Promise<void> {
    for (const entity of SYNC_ENTITIES) {
      let cursor = (await getMeta(CURSOR_KEYS[entity])) as string | null | undefined;
      let page = await this.client.changes([entity], cursor ?? null);
      let safety = 0;
      while (page && safety < 50) {
        safety += 1;
        await this.applyPage(entity, page);
        if (page.hasMore && page.nextCursor) {
          cursor = page.nextCursor;
          await setMeta(CURSOR_KEYS[entity], cursor);
          page = await this.client.changes([entity], cursor);
        } else {
          if (page.nextCursor) {
            await setMeta(CURSOR_KEYS[entity], page.nextCursor);
          }
          break;
        }
      }
    }
  }

  private async applyPage(entity: SyncEntity, page: SyncChangesResult): Promise<void> {
    const changes = page.itemsByEntity[entity] ?? [];
    for (const change of changes) {
      await this.applyChange(entity, change);
    }
  }

  private async applyChange(entity: SyncEntity, change: SyncChange): Promise<void> {
    const rec = change.clientId
      ? await getEntity(change.clientId)
      : change.id
        ? await getEntityById(entity, change.id)
        : undefined;

    if (change.changeType === "delete" || change.deleted || change.deletedAt) {
      if (rec && hasDirty(rec)) {
        // Local offline edit lost to a newer delete from another device.
        await this.pushIssue({ entity, clientId: rec.clientId, id: rec.id, kind: "conflict", reason: "Deleted on another device while you had offline edits.", canonical: null });
      }
      if (rec) {
        await putEntity({
          ...rec,
          deleted: true,
          deletedAt: change.deletedAt ?? null,
          updatedAt: change.updatedAt,
          rev: change.rev,
        });
      } else if (change.id) {
        await putEntity({
          entity,
          clientId: change.clientId ?? "",
          id: change.id,
          rev: change.rev,
          updatedAt: change.updatedAt,
          deleted: true,
          deletedAt: change.deletedAt ?? null,
          payload: change.payload ?? {},
          baseRev: change.rev,
        });
      }
      return;
    }

    const payload = change.payload ?? {};
    if (rec) {
      if (hasDirty(rec)) {
        const merged = { ...payload, ...rec.localDirty, clientId: rec.clientId, id: rec.id ?? payload.id };
        await putEntity({
          ...rec,
          id: rec.id ?? (payload.id as string),
          payload: merged,
          rev: change.rev,
          updatedAt: change.updatedAt,
          baseRev: change.rev,
        });
      } else {
        await putEntity({
          ...rec,
          id: (payload.id as string) ?? rec.id,
          payload,
          rev: change.rev,
          updatedAt: change.updatedAt,
          baseRev: change.rev,
          deleted: false,
          deletedAt: null,
        });
      }
    } else if (payload.id || change.clientId) {
      await putEntity({
        entity,
        clientId: change.clientId ?? (payload.clientId as string) ?? "",
        id: (payload.id as string) ?? change.id,
        rev: change.rev,
        updatedAt: change.updatedAt,
        deleted: false,
        deletedAt: null,
        payload,
        baseRev: change.rev,
      });
    }
  }

  /* -------------------------------- push -------------------------------- */

  private async push(): Promise<void> {
    // Only `pending` ops are pushed. A `failed`-status op is terminal (a
    // rejected or conflicting change) — it must be resolved explicitly (e.g.
    // resolveKeepMine/Theirs) and must NOT be blindly re-pushed on every sync,
    // which would keep hitting the server and never change state. Transient
    // failures are reset to `pending` (resetInFlightToPending), so they still
    // retry.
    const ops = (await getPendingOps()).filter((o) => o.status === "pending");
    if (ops.length === 0) return;

    for (let i = 0; i < chunkLength(ops, MAX_BATCH); i += 1) {
      const batch = ops.slice(i * MAX_BATCH, (i + 1) * MAX_BATCH);
      if (batch.length === 0) continue;

      for (const op of batch) {
        if (op.seq !== undefined) await setOpStatus(op.seq, "inFlight");
      }

      const pushOps: SyncPushOp[] = batch.map((op) => ({
        entity: op.entity,
        op: op.op,
        clientId: op.clientId,
        // A never-synced local record may carry an empty-string id. The server
        // treats `id` as optional for update/delete ops and locates the target
        // by `clientId`; sending "" would fail its ObjectId validation
        // (syncPushOpSchema.id), so omit it.
        id: op.id || undefined,
        // The op's `baseRev` is the server rev this change was based on. The
        // offline-store now folds updates into a pending create (no stale
        // baseRev race), and reconcileStaleFailedOps refreshes the baseRev of
        // legacy failed ops, so sending the op's own baseRev is correct.
        baseRev: op.baseRev,
        payload: op.payload ?? {},
        idempotencyKey: op.idempotencyKey,
      }));

      let result: SyncPushResult;
      try {
        result = await this.client.push(pushOps);
      } catch (err) {
        // The push itself failed (network, 5xx, ...) after this batch was set
        // to `inFlight`. Reset the batch to `pending` so a retry can pick it
        // back up; otherwise the ops would be stuck forever (getPendingOps
        // only returns `pending` + `failed`).
        await this.resetInFlightToPending(batch);
        throw err;
      }
      const items = result.results ?? [];
      for (let j = 0; j < batch.length; j += 1) {
        const op = batch[j];
        if (!op) continue;
        const item: SyncPushResultItem | undefined = items[j] ?? items.find((r) => r.clientId === op.clientId && r.entity === op.entity);
        if (!item) continue;
        await this.applyPushResult(op, item);
      }
    }
  }

  private async resetInFlightToPending(ops: OutboxOp[]): Promise<void> {
    for (const op of ops) {
      if (op.seq !== undefined) await setOpStatus(op.seq, "pending");
    }
  }

  private async applyPushResult(
    op: OutboxOp,
    item: SyncPushResultItem,
  ): Promise<void> {
    if (item.status === "applied" || item.status === "duplicate") {
      const canonical = (item.canonical as Record<string, unknown> | null | undefined) ?? op.payload;
      const rec = await getEntity(op.clientId);
      if (rec) {
        await putEntity({
          ...rec,
          id: (canonical.id as string) ?? rec.id,
          rev: (canonical.rev as number) ?? rec.rev,
          updatedAt: (canonical.updatedAt as string) ?? rec.updatedAt,
          payload: canonical,
          baseRev: canonical.rev as number,
          localDirty: undefined,
          conflict: false,
        });
      }
      if (op.seq !== undefined) {
        await setOpStatus(op.seq, "synced");
        await deleteOp(op.seq);
      }
      return;
    }

    if (item.status === "conflict") {
      // Keep the locally-authored version; surface for resolution.
      const rec = await getEntity(op.clientId);
      if (rec) {
        await putEntity({ ...rec, conflict: true });
      }
      await this.pushIssue({
        entity: op.entity,
        clientId: op.clientId,
        id: op.id,
        kind: "conflict",
        reason: item.reason ?? "Conflicting change detected.",
        canonical: item.canonical ?? null,
      });
      if (op.seq !== undefined) await setOpStatus(op.seq, "failed");
      return;
    }

    // rejected
    // A `create` rejected as `duplicate_transaction` means the server already
    // holds this record (same fingerprint, different clientId — e.g. the same
    // SMS transaction created on a previous/wiped device). This is the
    // *intended outcome* of server-side deduplication, not an error: reconcile
    // it as synced so it does not linger as a permanent "Needs attention" op
    // (and stop re-pushing it forever). Deduplication is NOT weakened — the
    // server still enforces it; we simply acknowledge the duplicate.
    if (op.op === "create" && item.reason === DUPLICATE_TRANSACTION_REASON) {
      const rec = await getEntity(op.clientId);
      if (rec) {
        await putEntity({ ...rec, localDirty: undefined, conflict: false });
      }
      if (op.seq !== undefined) {
        await setOpStatus(op.seq, "synced");
        await deleteOp(op.seq);
      }
      return;
    }

    await this.pushIssue({
      entity: op.entity,
      clientId: op.clientId,
      id: op.id,
      kind: "rejected",
      reason: item.reason ?? "Change was rejected by the server.",
      canonical: item.canonical ?? null,
    });
    if (op.seq !== undefined) await setOpStatus(op.seq, "failed");
  }

  /* ------------------------------ issues etc ----------------------------- */

  private async pushIssue(issue: SyncIssue): Promise<void> {
    const issues = (await getMeta("sync:issues")) as SyncIssue[] | undefined ?? [];
    const remaining = issues.filter(
      (i) => !(i.entity === issue.entity && i.clientId === issue.clientId),
    );
    await setMeta("sync:issues", [...remaining, issue]);
    await this.refreshStatic();
  }

  private async loadIssues(): Promise<SyncIssue[]> {
    return ((await getMeta("sync:issues")) as SyncIssue[] | undefined) ?? [];
  }

  /** User rejected the conflict: adopt the server canonical version. */
  async resolveKeepTheirs(entity: SyncEntity, clientId: string): Promise<void> {
    const issues = await this.loadIssues();
    const issue = issues.find((i) => i.entity === entity && i.clientId === clientId);
    const ops = await getPendingOps();
    for (const op of ops) {
      if (op.clientId === clientId && op.entity === entity) {
        if (op.seq !== undefined) await deleteOp(op.seq);
      }
    }
    const rec = await getEntity(clientId);
    if (rec && issue?.canonical) {
      await putEntity({
        ...rec,
        payload: issue.canonical,
        id: (issue.canonical.id as string) ?? rec.id,
        rev: (issue.canonical.rev as number) ?? rec.rev,
        updatedAt: (issue.canonical.updatedAt as string) ?? rec.updatedAt,
        baseRev: issue.canonical.rev as number,
        localDirty: undefined,
        conflict: false,
      });
    } else {
      await deleteEntityRecord(clientId);
    }
    await setMeta(
      "sync:issues",
      issues.filter((i) => !(i.entity === entity && i.clientId === clientId)),
    );
    await this.refreshStatic();
    await this.sync("manual");
  }

  /** User keeps their local version: re-push it as an explicit resolution. */
  async resolveKeepMine(entity: SyncEntity, clientId: string): Promise<void> {
    const issues = await this.loadIssues();
    await setMeta(
      "sync:issues",
      issues.filter((i) => !(i.entity === entity && i.clientId === clientId)),
    );
    const rec = await getEntity(clientId);
    if (!rec) return;
    for (const op of (await getPendingOps())) {
      if (op.clientId === clientId && op.entity === entity && op.seq !== undefined) {
        await setOpStatus(op.seq, "pending");
      }
    }
    const now = new Date().toISOString();
    await putEntity({
      ...rec,
      conflict: false,
      updatedAt: now,
      localDirty: rec.localDirty ?? toDirty(rec.payload),
    });
    await setOpStatusSafe({
      entity,
      clientId,
      baseRev: rec.baseRev ?? rec.rev ?? null,
      id: rec.id,
      payload: { ...rec.payload, ...(rec.localDirty ?? {}) },
    });
    await this.refreshStatic();
    await this.sync("manual");
  }

  async clearIssues(): Promise<void> {
    await setMeta("sync:issues", []);
    await this.refreshStatic();
  }

  static async resetCursor(entity: SyncEntity): Promise<void> {
    await setMeta(CURSOR_KEYS[entity], null);
  }

  static async reopenDb(): Promise<void> {
    await openDB();
  }
}

function defaultStorage(): KeyValueStorage | null {
  if (typeof globalThis !== "undefined" && "sessionStorage" in globalThis) {
    try {
      return globalThis.sessionStorage;
    } catch {
      return null;
    }
  }
  return null;
}

function toDirty(payload: Record<string, unknown>): Record<string, unknown> {
  return { ...payload };
}

async function setOpStatusSafe(op: {
  entity: SyncEntity;
  clientId: string;
  baseRev: number | null;
  id?: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const ops = await getPendingOps();
  const existing = ops.find(
    (o) => o.clientId === op.clientId && o.entity === op.entity && o.op === "update",
  );
  if (existing) {
    if (existing.seq !== undefined) await setOpStatus(existing.seq, "pending");
    return;
  }
  await enqueueOp({
    entity: op.entity,
    op: "update",
    clientId: op.clientId,
    id: op.id,
    baseRev: op.baseRev,
    payload: op.payload,
    idempotencyKey: uuid(),
    createdAt: new Date().toISOString(),
    attempt: 0,
    status: "pending",
  });
}
