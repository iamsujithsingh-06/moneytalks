/**
 * Receipt OCR ingestion pipeline (mobile): validate image -> run OCR provider
 * -> normalize into a ReceiptDraft -> dedup gate (vs ledger + review queue) ->
 * review queue. Confirmed drafts mirror the SMS flow and write into the shared
 * offline ledger with `source=ocr` and full provenance (imageHash, reference,
 * per-field confidence). Nothing auto-commits unless it clears the review gate.
 */
import {
  imageHash,
  isReceiptDuplicate,
  parseReceiptText,
  resolveProvider,
  validateImage,
  type OcrDedupeCandidate,
  type ReceiptDraft,
} from "@moneytalks/ocr";
import { offlineStore } from "@moneytalks/offline";
import {
  getDraft,
  listDrafts,
  newOcrDraftId,
  putDraft,
  updateDraftStatus,
  type OcrDraftRecord,
} from "./ocr-store.js";

export interface OcrIngestResult {
  record: OcrDraftRecord;
  captured: boolean;
  reason: string;
}

/** Input the capture UI hands the pipeline. */
export interface OcrCaptureInput {
  /** Pasted/typed receipt text, or the provider output when byte-based. */
  text?: string;
  /** Present when an actual image was captured (for hashing + dedup). */
  bytes?: Uint8Array;
  mimeType: string;
  name: string;
  size: number;
  /** Optional provider override; defaults to the first available. */
  providerId?: string;
  /** Optional small preview for the review UI. Not uploaded. */
  previewUrl?: string;
}

/** Build dedup candidates from the offline ledger + the OCR review queue. */
async function buildDedupCandidates(): Promise<OcrDedupeCandidate[]> {
  const candidates: OcrDedupeCandidate[] = [];

  const transactions = await offlineStore
    .list("transactions")
    .catch(() => []) as unknown as Array<Record<string, unknown>>;
  for (const tx of transactions) {
    if (tx.type === "delete") continue;
    candidates.push({
      transactionDate: String(tx.transactionDate ?? ""),
      amountMinor: Number(tx.amountMinor ?? 0),
      currency: String(tx.currency ?? "INR"),
      merchant: (tx.merchant as string | null) ?? null,
      imageHash: (tx.imageHash as string | undefined) ?? undefined,
      reference: (tx.reference as string | null) ?? null,
    });
  }

  const drafts = await listDrafts();
  for (const d of drafts) {
    if (!d.draft) continue;
    if (d.status === "rejected" || d.status === "ignored") continue;
    candidates.push({
      transactionDate: d.draft.transactionDate.value ?? "",
      amountMinor: d.draft.amountMinor.value,
      currency: d.draft.currency.value,
      merchant: d.draft.merchant.value,
      imageHash: d.imageHash ?? undefined,
      reference: d.draft.reference.value,
    });
  }

  return candidates;
}

/**
 * Ingest a receipt capture. Validates the image (when bytes/storage are
 * involved), runs a provider to obtain text, parses into a draft, and routes
 * through the dedup + review gates. Never throws; returns a stable outcome.
 */
export async function ingestReceipt(input: OcrCaptureInput): Promise<OcrIngestResult> {
  const now = new Date().toISOString();
  const provider = resolveProvider(input.providerId);

  // Reject clearly-unusable images up front (MIME/size) — no storage touched.
  if (!input.text && input.size > 0 && input.mimeType) {
    const err = validateImage({ mimeType: input.mimeType, size: input.size });
    if (err) {
      return makeRejected(now, null, input, provider.id, "ignored", err.message);
    }
  }

  const rawText = (input.text ?? "").trim();
  if (!rawText) {
    return makeRejected(now, null, input, provider.id, "ignored", "No receipt text could be read.");
  }

  const parsed = parseReceiptText(rawText);
  const image = input.bytes && input.bytes.length > 0 ? imageHash(input.bytes) : null;

  // Duplicate gate.
  const dedup = parsed.draft
    ? isReceiptDuplicate(
        {
          transactionDate: parsed.draft.transactionDate.value ?? "",
          amountMinor: parsed.draft.amountMinor.value,
          currency: parsed.draft.currency.value,
          merchant: parsed.draft.merchant.value,
          imageHash: image ?? undefined,
          reference: parsed.draft.reference.value,
        },
        await buildDedupCandidates(),
      )
    : null;
  const isDuplicateHit = Boolean(dedup?.isDuplicate);

  // Status routing.
  let status: OcrDraftStatusKnown = "ignored";
  if (isDuplicateHit) {
    status = "duplicate";
  } else if (parsed.draft) {
    status = "pending";
  }

  const record: OcrDraftRecord = {
    id: newOcrDraftId(),
    rawText,
    imageHash: image,
    previewUrl: input.previewUrl ?? null,
    provider: provider.id,
    draft: parsed.draft ?? null,
    status,
    dedupSignals: dedup?.signals ?? [],
    reason: dedup?.isDuplicate
      ? `Duplicate detected (${dedup.signals.join(", ")}).`
      : parsed.reason,
    createdAt: now,
    updatedAt: now,
  };

  await putDraft(record);

  return {
    record,
    captured: status === "pending" && !isDuplicateHit,
    reason: record.reason,
  };
}

type OcrDraftStatusKnown = OcrDraftRecord["status"];

function makeRejected(
  now: string,
  draft: ReceiptDraft | null,
  input: OcrCaptureInput,
  provider: string,
  status: OcrDraftStatusKnown,
  reason: string,
): OcrIngestResult {
  const record: OcrDraftRecord = {
    id: newOcrDraftId(),
    rawText: input.text ?? "",
    imageHash: input.bytes && input.bytes.length > 0 ? imageHash(input.bytes) : null,
    previewUrl: input.previewUrl ?? null,
    provider,
    draft,
    status,
    dedupSignals: [],
    reason,
    createdAt: now,
    updatedAt: now,
  };
  return { record, captured: false, reason };
}

/** User-supplied corrections applied before an OCR draft is confirmed. */
export interface OcrDraftEdits {
  type?: ReceiptDraft["type"]["value"];
  amountMinor?: number;
  merchant?: string | null;
  transactionDate?: string;
  currency?: string;
  paymentMethod?: ReceiptDraft["paymentMethod"]["value"];
}

/**
 * Commit a pending OCR draft to the offline ledger with full provenance. A
 * valid (user-confirmed) date is required — missing dates can't be committed.
 */
export async function confirmDraft(
  record: OcrDraftRecord,
  edits?: OcrDraftEdits,
): Promise<{ clientId: string } | null> {
  if (!record.draft) return null;
  const existing = await getDraft(record.id);
  if (!existing || existing.status !== "pending") return null;

  const d = record.draft;
  const date = edits?.transactionDate ?? d.transactionDate.value;
  if (!date) return null;

  const type = (edits?.type ?? d.type.value) ?? "expense";
  const payload = {
    type,
    amountMinor: edits?.amountMinor ?? d.amountMinor.value,
    currency: edits?.currency ?? d.currency.value,
    transactionDate: date.slice(0, 10),
    merchant: edits?.merchant !== undefined ? edits.merchant : d.merchant.value,
    paymentMethod: edits?.paymentMethod ?? d.paymentMethod.value,
    reference: d.reference.value ?? undefined,
    source: "ocr",
    status: "confirmed",
    autoDetected: true,
    confidence: d.overallConfidence,
    imageHash: record.imageHash ?? undefined,
    ocrRef: {
      provider: record.provider,
      imageHash: record.imageHash ?? undefined,
      reference: d.reference.value ?? undefined,
    },
  } as Record<string, unknown>;

  const { clientId } = await offlineStore.create("transactions", payload);
  await updateDraftStatus(record.id, "confirmed", { syncedClientId: clientId });
  return { clientId };
}

export async function rejectDraft(id: string): Promise<void> {
  const current = await getDraft(id);
  if (!current) return;
  await updateDraftStatus(id, "rejected");
}

export async function ignoreDraft(id: string): Promise<void> {
  const current = await getDraft(id);
  if (!current) return;
  await updateDraftStatus(id, "ignored");
}
