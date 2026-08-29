/**
 * Local-only storage for receipt OCR drafts + the review queue.
 *
 * Mirrors the SMS store (same IndexedDB pattern) in its own isolated database
 * (`moneytalks-ocr`) so a failed/wiped sync can never touch raw receipt text.
 * Raw OCR text + a small preview are kept locally only for review/provenance;
 * the original image bytes are discarded after extraction and never stored.
 */
import type { ReceiptDraft } from "@moneytalks/ocr";
import { uuid } from "@moneytalks/offline";

const DB_NAME = "moneytalks-ocr";
const DB_VERSION = 1;

export type OcrDraftStatus =
  | "pending"
  | "confirmed"
  | "rejected"
  | "duplicate"
  | "ignored";

export interface OcrDraftRecord {
  id: string;
  /** Raw OCR/provider text, kept locally for provenance + re-extract. */
  rawText: string;
  /** Stable image content hash (identical-receipt dedup). Never the bytes. */
  imageHash: string | null;
  /** Small downscaled preview data URL for the review UI (optional). */
  previewUrl: string | null;
  /** The extraction provider that produced `rawText`. */
  provider: string;
  /** ReceiptDraft if the text parsed into a usable draft. */
  draft: ReceiptDraft | null;
  status: OcrDraftStatus;
  /** Signals from the dedup gate when this receipt was a duplicate. */
  dedupSignals: string[];
  /** Human-safe reason (no raw receipt contents). */
  reason: string;
  /** clientId of the offline transaction created on confirm. */
  syncedClientId?: string;
  createdAt: string;
  updatedAt: string;
}

interface DraftRecordStored {
  id: string;
  rawText: string;
  imageHash: string | null;
  previewUrl: string | null;
  provider: string;
  draft: ReceiptDraft | null;
  status: string;
  dedupSignals: string[];
  reason: string;
  syncedClientId?: string;
  createdAt: string;
  updatedAt: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openOcrDB(): Promise<IDBDatabase> {
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
      req.onerror = () => reject(req.error ?? new Error("Failed to open OCR IndexedDB"));
      req.onblocked = () => reject(new Error("OCR IndexedDB upgrade blocked"));
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
  const db = await openOcrDB();
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
    tx.onerror = () => reject(tx.error ?? new Error("OCR write failed"));
    tx.onabort = () => reject(tx.error ?? new Error("OCR write aborted"));
  });
}

async function readTx<T>(run: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await openOcrDB();
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
    tx.onerror = () => reject(tx.error ?? new Error("OCR read failed"));
  });
}

function fromStored(stored: DraftRecordStored): OcrDraftRecord {
  return {
    id: stored.id,
    rawText: stored.rawText,
    imageHash: stored.imageHash,
    previewUrl: stored.previewUrl,
    provider: stored.provider,
    draft: stored.draft,
    status: stored.status as OcrDraftStatus,
    dedupSignals: stored.dedupSignals ?? [],
    reason: stored.reason,
    syncedClientId: stored.syncedClientId,
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
  };
}

export async function putDraft(rec: OcrDraftRecord): Promise<void> {
  await writeTx(async (s) => {
    await reqToPromise(s.put(rec as DraftRecordStored) as IDBRequest<IDBValidKey>);
  });
}

export async function getDraft(id: string): Promise<OcrDraftRecord | null> {
  return readTx(async (s) => {
    const stored = await reqToPromise(s.get(id) as IDBRequest<DraftRecordStored | undefined>);
    return stored ? fromStored(stored) : null;
  });
}

export async function listDrafts(status?: OcrDraftStatus): Promise<OcrDraftRecord[]> {
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

export async function listPendingDrafts(): Promise<OcrDraftRecord[]> {
  return listDrafts("pending");
}

export async function updateDraftStatus(
  id: string,
  status: OcrDraftStatus,
  patch: Partial<Pick<OcrDraftRecord, "syncedClientId" | "dedupSignals">> = {},
): Promise<OcrDraftRecord | null> {
  const current = await getDraft(id);
  if (!current) return null;
  const updated: OcrDraftRecord = {
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

export function newOcrDraftId(): string {
  return uuid();
}
