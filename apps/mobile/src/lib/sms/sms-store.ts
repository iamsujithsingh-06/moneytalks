/**
 * Local-only storage for SMS-derived transaction drafts + the review queue.
 *
 * Per SMS_TRANSACTION_ARCHITECTURE §12, drafts stay on-device until the user
 * confirms them; only confirmed items flow into the offline store + sync. Raw
 * message bodies are stored locally only (the server never sees them).
 *
 * A separate IndexedDB database keeps SMS draft data isolated from the sync
 * ledger so a failed/wiped sync can never touch raw SMS.
 */
import type { SmsDisposition, SmsTransactionDraft } from "@moneytalks/sms";
import { uuid } from "@moneytalks/offline";

const DB_NAME = "moneytalks-sms";
const DB_VERSION = 1;

export type SmsDraftStatus =
  | "pending"
  | "confirmed"
  | "rejected"
  | "duplicate"
  | "ignored";

export interface SmsDraftRecord {
  /** Stable unique id (UUID) for this captured message/draft. */
  id: string;
  sender: string | null;
  body: string;
  receivedAt: string | null;
  messageHash: string;
  discipline: SmsDisposition;
  reason: string;
  bankSource: string | null;
  draft: SmsTransactionDraft | null;
  status: SmsDraftStatus;
  /** Signals from the dedup gate when the message was a duplicate. */
  dedupSignals: string[];
  /** clientId of the offline transaction created on confirm. */
  syncedClientId?: string;
  createdAt: string;
  updatedAt: string;
}

interface DraftRecordStored {
  id: string;
  sender: string | null;
  body: string;
  receivedAt: string | null;
  messageHash: string;
  discipline: string;
  reason: string;
  bankSource: string | null;
  draft: SmsTransactionDraft | null;
  status: string;
  dedupSignals: string[];
  syncedClientId?: string;
  createdAt: string;
  updatedAt: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openSmsDB(): Promise<IDBDatabase> {
  dbPromise =
    dbPromise ??
    new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("drafts")) {
          const store = db.createObjectStore("drafts", { keyPath: "id" });
          store.createIndex("by_status", "status", { unique: false });
          store.createIndex("by_created", "createdAt", { unique: false });
          store.createIndex("by_status_created", ["status", "createdAt"], {
            unique: false,
          });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("Failed to open SMS IndexedDB"));
      req.onblocked = () => reject(new Error("SMS IndexedDB upgrade blocked"));
    });
  return dbPromise;
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

async function writeTx<T>(run: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await openSmsDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction("drafts", "readwrite");
    let result: T;
    run(tx.objectStore("drafts"))
      .then((r) => {
        result = r;
      })
      .catch((err) => {
        tx.abort();
        reject(err);
      });
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error ?? new Error("SMS write failed"));
    tx.onabort = () => reject(tx.error ?? new Error("SMS write aborted"));
  });
}

async function readTx<T>(run: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await openSmsDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction("drafts", "readonly");
    let result: T;
    run(tx.objectStore("drafts"))
      .then((r) => {
        result = r;
      })
      .catch((err) => {
        tx.abort();
        reject(err);
      });
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error ?? new Error("SMS read failed"));
  });
}

function toStored(rec: SmsDraftRecord): DraftRecordStored {
  return { ...rec };
}

function fromStored(stored: DraftRecordStored): SmsDraftRecord {
  return {
    id: stored.id,
    sender: stored.sender,
    body: stored.body,
    receivedAt: stored.receivedAt,
    messageHash: stored.messageHash,
    discipline: stored.discipline as SmsDraftRecord["discipline"],
    reason: stored.reason,
    bankSource: stored.bankSource,
    draft: stored.draft,
    status: stored.status as SmsDraftStatus,
    dedupSignals: stored.dedupSignals ?? [],
    syncedClientId: stored.syncedClientId,
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
  };
}

export async function putDraft(rec: SmsDraftRecord): Promise<void> {
  await writeTx(async (s) => {
    await reqToPromise(s.put(toStored(rec)) as IDBRequest<IDBValidKey>);
  });
}

export async function getDraft(id: string): Promise<SmsDraftRecord | null> {
  return readTx(async (s) => {
    const stored = await reqToPromise(s.get(id) as IDBRequest<DraftRecordStored | undefined>);
    return stored ? fromStored(stored) : null;
  });
}

export async function listDrafts(status?: SmsDraftStatus): Promise<SmsDraftRecord[]> {
  return readTx(async (s) => {
    let stored: DraftRecordStored[];
    if (status) {
      const index = s.index("by_status");
      stored = await reqToPromise(index.getAll(status) as IDBRequest<DraftRecordStored[]>);
    } else {
      stored = await reqToPromise(s.getAll() as IDBRequest<DraftRecordStored[]>);
    }
    return stored
      .map(fromStored)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  });
}

export async function listPendingDrafts(): Promise<SmsDraftRecord[]> {
  return listDrafts("pending");
}

export async function updateDraftStatus(
  id: string,
  status: SmsDraftStatus,
  patch: Partial<Pick<SmsDraftRecord, "syncedClientId" | "dedupSignals">> = {},
): Promise<SmsDraftRecord | null> {
  const current = await getDraft(id);
  if (!current) return null;
  const updated: SmsDraftRecord = {
    ...current,
    ...patch,
    status,
    updatedAt: new Date().toISOString(),
  };
  await putDraft(updated);
  return updated;
}

export async function purgeDraft(id: string): Promise<void> {
  await writeTx(async (s) => {
    await reqToPromise(s.delete(id) as IDBRequest<undefined>);
  });
}

export async function clearDrafts(): Promise<void> {
  await writeTx(async (s) => {
    await reqToPromise(s.clear() as IDBRequest<undefined>);
  });
}

/**
 * Delete resolved (non-pending) drafts older than `retentionDays`, so raw SMS
 * bodies and SMS-derived data are not retained on-device indefinitely. Pending
 * (still under review) drafts are always preserved regardless of age.
 */
export async function cleanupDrafts(
  retentionDays = 30,
): Promise<number> {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const all = await listDrafts();
  let removed = 0;
  for (const rec of all) {
    if (rec.status === "pending") continue;
    const ts = Date.parse(rec.updatedAt ?? rec.createdAt);
    if (Number.isNaN(ts) || ts < cutoff) {
      await purgeDraft(rec.id);
      removed += 1;
    }
  }
  return removed;
}

export function newDraftId(): string {
  return uuid();
}
