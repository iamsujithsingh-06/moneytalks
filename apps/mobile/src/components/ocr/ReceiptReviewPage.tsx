import { useCallback, useEffect, useState } from "react";
import { useOcr } from "../../state/ocr-context.js";
import type { OcrDraftEdits } from "../../lib/ocr/ocr-ingest.js";
import type { OcrDraftRecord } from "../../lib/ocr/ocr-store.js";
import { ErrorCard, PageLoader } from "../ui/feedback.js";
import { EmptyState } from "../ui/EmptyState.js";
import { Button } from "../ui/Button.js";
import { PasteIcon } from "../ui/icons.js";
import { ReceiptCaptureEntry } from "./ReceiptCaptureEntry.js";
import { ReceiptDraftCard } from "./ReceiptDraftCard.js";
import { ReceiptEditForm } from "./ReceiptEditForm.js";

export function ReceiptReviewPage() {
  const { pending, capturedCount, refresh, confirm, reject, busy } = useOcr();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your review queue.");
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleConfirm = useCallback(
    async (record: OcrDraftRecord, edits?: OcrDraftEdits) => {
      setConfirmingId(record.id);
      try {
        await confirm(record, edits);
      } finally {
        setConfirmingId(null);
        setEditingId(null);
      }
    },
    [confirm],
  );

  const handleReject = useCallback(
    async (id: string) => {
      await reject(id);
      if (editingId === id) setEditingId(null);
    },
    [reject, editingId],
  );

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-8">
      <header className="pb-4 pt-2">
        <h1 className="text-2xl font-bold text-text-primary">Receipt review</h1>
        <p className="mt-1 text-sm text-text-muted">
          Transactions parsed from your receipts, awaiting your confirm. Nothing is synced until
          you approve it.
        </p>
      </header>

      <div className="space-y-6">
        <ReceiptCaptureEntry />

        {error ? (
          <ErrorCard
            message={error}
            onRetry={() => {
              void load();
            }}
          />
        ) : null}

        {loading ? (
          <PageLoader label="Loading your review queue…" />
        ) : pending.length === 0 ? (
          <EmptyState
            icon={<PasteIcon size={26} />}
            title="Nothing to review"
            description="When a receipt is captured it will show up here for you to confirm, edit, or dismiss."
          />
        ) : (
          <section aria-label="Pending receipt transactions">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-secondary">
                Awaiting review{" "}
                <span className="ml-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary">
                  {capturedCount}
                </span>
              </h2>
            </div>
            <ul className="space-y-3">
              {pending.map((record) =>
                editingId === record.id ? (
                  <li key={record.id}>
                    <ReceiptEditForm
                      key={record.id}
                      record={record}
                      busy={busy && confirmingId === record.id}
                      onSave={(edits) => {
                        void handleConfirm(record, edits);
                      }}
                      onCancel={() => setEditingId(null)}
                    />
                  </li>
                ) : (
                  <li key={record.id}>
                    <ReceiptDraftCard
                      record={record}
                      busy={busy && confirmingId === record.id}
                      onEdit={(rec) => setEditingId(rec.id)}
                      onConfirm={(rec) => {
                        void handleConfirm(rec);
                      }}
                      onReject={(id) => {
                        void handleReject(id);
                      }}
                    />
                  </li>
                ),
              )}
            </ul>
          </section>
        )}

        <Button variant="ghost" size="sm" className="w-full" onClick={() => void load()}>
          Refresh
        </Button>
      </div>
    </div>
  );
}
