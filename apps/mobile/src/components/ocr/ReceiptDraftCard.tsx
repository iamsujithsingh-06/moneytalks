import type { OcrDraftRecord } from "../../lib/ocr/ocr-store.js";
import { formatDate } from "../../lib/format.js";
import { Badge } from "../ui/Badge.js";
import { Button } from "../ui/Button.js";
import { Money } from "../ui/Money.js";
import { AlertIcon, CheckIcon, PencilIcon } from "../ui/icons.js";
import { paymentMethodLabel, signedMinor, typeLabel } from "../../lib/ocr/draft-meta.js";

interface ReceiptDraftCardProps {
  record: OcrDraftRecord;
  busy?: boolean;
  onEdit: (record: OcrDraftRecord) => void;
  onConfirm: (record: OcrDraftRecord) => void;
  onReject: (id: string) => void;
}

export function ReceiptDraftCard({
  record,
  busy = false,
  onEdit,
  onConfirm,
  onReject,
}: ReceiptDraftCardProps) {
  const draft = record.draft;

  if (!draft) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-sm text-text-muted">No transaction details could be extracted.</p>
      </div>
    );
  }

  const type = draft.type.value ?? "expense";
  const merchant = draft.merchant.value ?? "Unknown merchant";
  const signed = signedMinor(type, draft.amountMinor.value);
  const date = draft.transactionDate.value;
  const needsReview = draft.needsReview || draft.amountMinor.needsReview;

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {needsReview ? (
            <Badge tone="warning" icon={<AlertIcon size={13} />}>
              Review required
            </Badge>
          ) : (
            <Badge tone="primary">{typeLabel(type)}</Badge>
          )}
          <Badge tone="neutral">{paymentMethodLabel(draft.paymentMethod.value)}</Badge>
        </div>
        <span className="font-mono text-[11px] text-text-muted">
          Receipt · {Math.round(draft.overallConfidence * 100)}%
        </span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-medium text-text-primary">{merchant}</p>
          {draft.reference.value ? (
            <p className="truncate text-sm text-text-muted">{draft.reference.value}</p>
          ) : null}
          <p className="mt-1 text-sm text-text-muted">
            {date ? formatDate(date) : "Date not detected"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <Money
            amountMinor={signed}
            currency={draft.currency.value}
            signed
            withIcon
            size="md"
          />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<PencilIcon size={15} />}
          onClick={() => onEdit(record)}
          aria-label={`Edit ${merchant} receipt`}
        >
          Edit
        </Button>
        <Button
          variant="primary"
          size="sm"
          leftIcon={<CheckIcon size={15} />}
          loading={busy}
          onClick={() => onConfirm(record)}
          aria-label={`Confirm ${merchant}`}
        >
          Confirm
        </Button>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => onReject(record.id)}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
