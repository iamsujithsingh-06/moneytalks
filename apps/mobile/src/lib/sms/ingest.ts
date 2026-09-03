/**
 * SMS ingestion pipeline (mobile): detect -> parse -> normalize -> classify ->
 * dedup gate -> ledger commit (high confidence) or review queue (uncertain).
 * Reuses @moneytalks/sms for parsing and classification, and
 * @moneytalks/offline (the shared ledger) for duplicate detection so offline
 * review and multi-device sync never double-capture.
 */
import {
  isDuplicate,
  messageHash,
  parseSms,
  type DraftTransactionType,
  type DuplicateCandidate,
  type SmsMessage,
  type SmsPaymentMethodKind,
} from "@moneytalks/sms";
import { offlineStore } from "@moneytalks/offline";
import { syncEngine } from "../offline/index.js";
import {
  getDraft,
  listDrafts,
  cleanupDrafts,
  newDraftId,
  putDraft,
  updateDraftStatus,
  type SmsDraftRecord,
} from "./sms-store.js";

export interface IngestResult {
  record: SmsDraftRecord;
  /** True when the message was a financial and stored for review. */
  captured: boolean;
  reason: string;
}

/** Build dedup candidates from the offline ledger + the review queue. */
async function buildDedupCandidates(): Promise<DuplicateCandidate[]> {
  const candidates: DuplicateCandidate[] = [];

  const transactions = await offlineStore
    .list("transactions")
    .catch(() => []) as unknown as Array<Record<string, unknown>>;
  for (const tx of transactions) {
    if (tx.type !== "delete") {
      candidates.push({
        transactionDate: String(tx.transactionDate ?? ""),
        amountMinor: Number(tx.amountMinor ?? 0),
        currency: String(tx.currency ?? "INR"),
        merchant: (tx.merchant as string | null) ?? null,
        accountRef: (tx.accountRef as string | null) ?? null,
        messageHash: (tx.messageHash as string | undefined) ?? undefined,
        upiRef: (tx.upiRef as string | null) ?? null,
        bankRef: (tx as { smsRef?: { bankRef?: string | null } | null }).smsRef?.bankRef ?? null,
        bankSource: (tx.bankSource as string | null) ?? null,
      });
    }
  }

  const drafts = await listDrafts();
  for (const d of drafts) {
    if (!d.draft) continue;
    if (d.status === "rejected" || d.status === "ignored") continue;
    candidates.push({
      transactionDate: d.draft.transactionDate,
      amountMinor: d.draft.amountMinor,
      currency: d.draft.currency,
      merchant: d.draft.merchant,
      accountRef: d.draft.accountRef,
      messageHash: d.messageHash,
      upiRef: d.draft.upiRef,
      bankSource: d.draft.bankSource,
    });
  }

  return candidates;
}

/**
 * Ingest a single SMS. Non-financial / unsupported messages are stored with a
 * corresponding status but not queued for confirm. Duplicates are flagged via
 * the dedup gate (message hash / UPI ref / content fingerprint).
 *
 * Routing decision:
 * - High-confidence, successfully parsed bank/UPI SMS (`disposition ===
 *   "transaction"`) are committed directly to the transaction ledger as
 *   Auto Income (credit) / Auto Expense (debit) — no Review required.
 * - Uncertain / low-confidence / ambiguous items (`disposition ===
 *   "ambiguous"`, or no parse) continue through the Review queue.
 * - Receipt/OCR items are handled by their own (unchanged) pipeline.
 */
export async function ingestSms(message: SmsMessage): Promise<IngestResult> {
  const now = new Date().toISOString();
  const hash = messageHash(message.body);

  // Opportunistically purge resolved drafts older than the retention window so
  // raw SMS bodies are not kept on-device indefinitely. Fire-and-forget: it
  // must never block the ingest path.
  void cleanupDrafts().catch(() => undefined);

  const existingByIdentity = await findExisting(message);
  if (existingByIdentity) {
    return {
      record: existingByIdentity,
      captured: false,
      reason: `Already captured on ${existingByIdentity.createdAt}.`,
    };
  }

  const parsed = parseSms(message);
  const candidates = await buildDedupCandidates();
  const dedup = parsed.draft ? isDuplicate(parsed.draft, candidates) : null;
  const isDuplicateHit = Boolean(dedup?.isDuplicate);

  let status: SmsDraftRecord["status"];
  if (isDuplicateHit) {
    status = "duplicate";
  } else if (parsed.disposition === "transaction" || parsed.disposition === "ambiguous") {
    status = "pending";
  } else {
    status = "ignored";
  }

  const record: SmsDraftRecord = {
    id: newDraftId(),
    sender: message.sender,
    body: message.body,
    receivedAt: message.receivedAt,
    messageHash: hash,
    discipline: parsed.disposition,
    reason: parsed.reason,
    bankSource: parsed.bankSource,
    draft: parsed.draft ?? null,
    status,
    dedupSignals: dedup?.signals ?? [],
    createdAt: now,
    updatedAt: now,
  };

  await putDraft(record);

  // Auto-confirm high-confidence SMS transactions directly into the ledger.
  // Only `disposition === "transaction"` (confidence >= 0.75) qualifies;
  // the parser routes everything below that to `"ambiguous"`, which stays in
  // Review. Reuses confirmDraft so the transaction payload, source metadata
  // (source: "sms", autoDetected), confidence and smsRef are preserved
  // exactly as a manual confirm would produce.
  const autoConfirmed =
    !isDuplicateHit &&
    status === "pending" &&
    parsed.disposition === "transaction" &&
    record.draft != null
      ? await confirmDraft(record)
      : null;

  if (autoConfirmed) {
    record.status = "confirmed";
    record.syncedClientId = autoConfirmed.clientId;
    record.updatedAt = new Date().toISOString();
    // Push the auto-committed transaction to the server immediately, matching
    // the manual confirm path.
    void syncEngine.sync("manual");
  }

  return {
    record,
    captured: status === "pending" || autoConfirmed != null,
    reason: dedup?.isDuplicate
      ? `Duplicate detected (${dedup.signals.join(", ")}).`
      : autoConfirmed
        ? `Parsed and committed to the ledger as Auto ${record.draft?.type === "income" ? "Income" : "Expense"}.`
        : parsed.reason,
  };
}

/** Re-ingest an existing message: find a stored record by message hash. */
async function findExisting(message: SmsMessage): Promise<SmsDraftRecord | null> {
  const hash = messageHash(message.body);
  const drafts = await listDrafts();
  const match = drafts.find(
    (d) => d.messageHash === hash || (d.draft?.upiRef && message.body.includes(d.draft.upiRef)),
  );
  if (match && (match.status === "pending" || match.status === "confirmed" || match.status === "duplicate")) {
    return match;
  }
  return null;
}

/** User-supplied corrections applied before a draft is confirmed. */
export interface SmsDraftEdits {
  type?: DraftTransactionType;
  amountMinor?: number;
  merchant?: string | null;
  counterparty?: string | null;
  transactionDate?: string;
  paymentMethodKind?: SmsPaymentMethodKind;
  note?: string;
}

/** Confirm a pending draft: writes to the offline store and marks it synced.
 *  Optional `edits` let the user correct parsed fields before confirming. */
export async function confirmDraft(
  record: SmsDraftRecord,
  edits?: SmsDraftEdits,
): Promise<{ clientId: string } | null> {
  if (!record.draft) return null;
  const existing = await getDraft(record.id);
  if (!existing || existing.status !== "pending") return null;

  const draft = { ...record.draft, ...edits };
  const payload = {
    type: draft.type,
    amountMinor: draft.amountMinor,
    currency: draft.currency,
    transactionDate: draft.transactionDate.slice(0, 10),
    merchant: draft.merchant ?? undefined,
    counterparty: draft.counterparty ?? undefined,
    accountRef: draft.accountRef ?? undefined,
    paymentMethodKind: draft.paymentMethodKind ?? undefined,
    note: edits?.note ?? undefined,
    source: "sms",
    status: "confirmed",
    autoDetected: true,
    confidence: draft.confidence,
    bankSource: draft.bankSource ?? undefined,
    smsRef: {
      upiRef: draft.upiRef ?? undefined,
      bankRef: draft.bankRef ?? undefined,
      messageHash: draft.messageHash,
      receivedAt: record.receivedAt ?? undefined,
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
