import type { SyncEntity, SyncOp } from "@moneytalks/types";

const DB_NAME = "moneytalks";
const DB_VERSION = 1;

/**
 * A locally-stored entity snapshot (transactions / categories /
 * payment-methods). `payload` holds the canonical server document (or a
 * locally-authored one) so the UI can read straight from IndexedDB.
 *
 * `localDirty` tracks fields changed on this device since the last successful
 * push. Those fields win during pull-time merge and are re-pushed as an
 * update op. `baseRev` is the server rev this device based its change on
 * (used for conflict detection on push).
 */
export interface EntityRecord {
  entity: SyncEntity;
  clientId: string;
  id?: string;
  rev?: number;
  updatedAt?: string;
  deletedAt?: string | null;
  deleted?: boolean;
  payload: Record<string, unknown>;
  localDirty?: Record<string, unknown>;
  baseRev?: number | null;
  conflict?: boolean;
}

export interface OutboxOp {
  seq?: number;
  entity: SyncEntity;
  op: SyncOp;
  clientId: string;
  id?: string;
  baseRev?: number | null;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
  createdAt: string;
  attempt: number;
  status: "pending" | "inFlight" | "failed" | "synced";
}

export interface MetaRecord {
  key: string;
  value: unknown;
}

export type RecordPatch =
  | { type: "entities"; key: string; value: EntityRecord }
  | { type: "entities:delete"; key: string }
  | { type: "outbox"; value: OutboxOp }
  | { type: "outbox:status"; key: number; status: OutboxOp["status"] }
  | { type: "outbox:delete"; key: number }
  | { type: "meta"; key: string; value: unknown };

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDB(): Promise<IDBDatabase> {
  dbPromise =
    dbPromise ??
    new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("entities")) {
          const store = db.createObjectStore("entities", { keyPath: "clientId" });
          store.createIndex("by_entity", "entity", { unique: false });
          store.createIndex("by_id", "id", { unique: false });
        }
        if (!db.objectStoreNames.contains("outbox")) {
          const store = db.createObjectStore("outbox", {
            keyPath: "seq",
            autoIncrement: true,
          });
          store.createIndex("by_status", "status", { unique: false });
          store.createIndex("by_client", "clientId", { unique: false });
        }
        if (!db.objectStoreNames.contains("meta")) {
          const store = db.createObjectStore("meta", { keyPath: "key" });
          store.createIndex("by_key", "key", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
      req.onblocked = () => reject(new Error("IndexedDB upgrade blocked"));
    });
  return dbPromise;
}

interface Stores {
  entities: IDBObjectStore;
  outbox: IDBObjectStore;
  meta: IDBObjectStore;
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

async function transact<T>(
  mode: IDBTransactionMode,
  run: (stores: Stores) => Promise<T>,
): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(["entities", "outbox", "meta"], mode);
    let result: T;
    run({
      entities: tx.objectStore("entities"),
      outbox: tx.objectStore("outbox"),
      meta: tx.objectStore("meta"),
    })
      .then((r) => {
        result = r;
      })
      .catch((err) => {
        tx.abort();
        reject(err);
      });
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function readTx<T>(run: (stores: Stores) => Promise<T>): Promise<T> {
  return transact("readonly", run);
}

function writeTx<T>(run: (stores: Stores) => Promise<T>): Promise<T> {
  return transact("readwrite", run);
}

/* ------------------------------- entities ------------------------------- */

export function getEntity(clientId: string): Promise<EntityRecord | undefined> {
  return readTx((s) =>
    requestToPromise(s.entities.get(clientId) as IDBRequest<EntityRecord | undefined>),
  );
}

export function getEntityById(
  entity: SyncEntity,
  id: string,
): Promise<EntityRecord | undefined> {
  return readTx(async (s) => {
    const index = s.entities.index("by_id");
    const records = await requestToPromise(
      index.getAll(id) as IDBRequest<EntityRecord[]>,
    );
    return records.find((r) => r.entity === entity);
  });
}

export function getAllEntities(entity: SyncEntity): Promise<EntityRecord[]> {
  return readTx((s) =>
    requestToPromise(s.entities.index("by_entity").getAll(entity) as IDBRequest<
      EntityRecord[]
    >),
  );
}

export function getAllEntityRecords(): Promise<EntityRecord[]> {
  return readTx((s) => requestToPromise(s.entities.getAll() as IDBRequest<EntityRecord[]>));
}

export function putEntity(record: EntityRecord): Promise<void> {
  return writeTx((s) =>
    requestToPromise(s.entities.put(record) as IDBRequest<IDBValidKey>).then(() => undefined),
  );
}

export function deleteEntityRecord(clientId: string): Promise<void> {
  return writeTx((s) =>
    requestToPromise(s.entities.delete(clientId) as IDBRequest<undefined>).then(() => undefined),
  );
}

/* -------------------------------- outbox -------------------------------- */

export function enqueueOp(op: OutboxOp): Promise<number> {
  return writeTx(async (s) => {
    const req = s.outbox.add(op) as IDBRequest<number>;
    return await requestToPromise(req);
  });
}

export function getPendingOps(): Promise<OutboxOp[]> {
  return readTx(async (s) => {
    const index = s.outbox.index("by_status");
    const pending = await requestToPromise(
      index.getAll("pending") as IDBRequest<OutboxOp[]>,
    );
    const failed = await requestToPromise(
      index.getAll("failed") as IDBRequest<OutboxOp[]>,
    );
    return [...pending, ...failed].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  });
}

export function getOutbox(): Promise<OutboxOp[]> {
  return readTx((s) => requestToPromise(s.outbox.getAll() as IDBRequest<OutboxOp[]>));
}

export function setOpStatus(
  seq: number,
  status: OutboxOp["status"],
): Promise<void> {
  return writeTx(async (s) => {
    const op = await requestToPromise(s.outbox.get(seq) as IDBRequest<OutboxOp | undefined>);
    if (op) {
      await requestToPromise(s.outbox.put({ ...op, status }) as IDBRequest<IDBValidKey>);
    }
  });
}

export function deleteOp(seq: number): Promise<void> {
  return writeTx((s) =>
    requestToPromise(s.outbox.delete(seq) as IDBRequest<undefined>).then(() => undefined),
  );
}

/** Replace a single outbox op in place (e.g. when folding an update into a
 *  pending create / refreshing its baseRev). No-op if `seq` is absent. */
export function updateOp(seq: number, patch: Partial<OutboxOp>): Promise<void> {
  return writeTx(async (s) => {
    const op = await requestToPromise(s.outbox.get(seq) as IDBRequest<OutboxOp | undefined>);
    if (op) {
      await requestToPromise(
        s.outbox.put({ ...op, ...patch, seq } as OutboxOp) as IDBRequest<IDBValidKey>,
      );
    }
  });
}

/* --------------------------------- meta --------------------------------- */

export function getMeta(key: string): Promise<unknown> {
  return readTx(async (s) => {
    const rec = await requestToPromise(s.meta.get(key) as IDBRequest<MetaRecord | undefined>);
    return rec?.value;
  });
}

export function setMeta(key: string, value: unknown): Promise<void> {
  return writeTx((s) =>
    requestToPromise(s.meta.put({ key, value }) as IDBRequest<IDBValidKey>).then(() => undefined),
  );
}

export function persist(patches: RecordPatch[]): Promise<void> {
  return writeTx(async (stores) => {
    for (const patch of patches) {
      switch (patch.type) {
        case "entities":
          await requestToPromise(
            stores.entities.put(patch.value) as IDBRequest<IDBValidKey>,
          );
          break;
        case "entities:delete":
          await requestToPromise(
            stores.entities.delete(patch.key) as IDBRequest<undefined>,
          );
          break;
        case "outbox": {
          const { seq, ...op } = patch.value;
          if (seq !== undefined) {
            await requestToPromise(stores.outbox.put(patch.value) as IDBRequest<IDBValidKey>);
          } else {
            const key = await requestToPromise(stores.outbox.add(op) as IDBRequest<number>);
            patch.value.seq = key;
          }
          break;
        }
        case "outbox:status": {
          const op = await requestToPromise(
            stores.outbox.get(patch.key) as IDBRequest<OutboxOp | undefined>,
          );
          if (op) {
            await requestToPromise(
              stores.outbox.put({ ...op, status: patch.status }) as IDBRequest<IDBValidKey>,
            );
          }
          break;
        }
        case "outbox:delete":
          await requestToPromise(stores.outbox.delete(patch.key) as IDBRequest<undefined>);
          break;
        case "meta":
          await requestToPromise(
            stores.meta.put({ key: patch.key, value: patch.value }) as IDBRequest<IDBValidKey>,
          );
          break;
      }
    }
  });
}

export function clearAll(): Promise<void> {
  return writeTx(async (s) => {
    await requestToPromise(s.entities.clear() as IDBRequest<undefined>);
    await requestToPromise(s.outbox.clear() as IDBRequest<undefined>);
    await requestToPromise(s.meta.clear() as IDBRequest<undefined>);
  });
}
