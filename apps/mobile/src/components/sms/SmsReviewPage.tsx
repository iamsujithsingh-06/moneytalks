import { useCallback, useEffect, useState } from "react";
import { useSms } from "../../state/sms-context.js";
import type { SmsDraftEdits } from "../../lib/sms/ingest.js";
import type { SmsDraftRecord } from "../../lib/sms/sms-store.js";
import { ErrorCard, PageLoader } from "../ui/feedback.js";
import { EmptyState } from "../ui/EmptyState.js";
import { Button } from "../ui/Button.js";
import { MessageIcon } from "../ui/icons.js";
import { CaptureEntry } from "./CaptureEntry.js";
import { CapturePanel } from "./CapturePanel.js";
import { SmsDraftCard } from "./SmsDraftCard.js";
import { EditDraftForm } from "./EditDraftForm.js";

export function SmsReviewPage() {
  const { pending, capturedCount, refresh, confirm, reject, busy } = useSms();
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
    async (record: SmsDraftRecord, edits?: SmsDraftEdits) => {
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
        <h1 className="text-2xl font-bold text-text-primary">SMS review</h1>
        <p className="mt-1 text-sm text-text-muted">
          Transactions parsed from your messages, awaiting your confirm. Nothing is synced until
          you approve it.
        </p>
      </header>

      <div className="space-y-6">
        <CapturePanel />
        <CaptureEntry />

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
            icon={<MessageIcon size={26} />}
            title="Nothing to review"
            description="When an SMS is captured it will show up here for you to confirm, edit, or dismiss."
          />
        ) : (
          <section aria-label="Pending SMS transactions">
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
                    <EditDraftForm
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
                    <SmsDraftCard
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
