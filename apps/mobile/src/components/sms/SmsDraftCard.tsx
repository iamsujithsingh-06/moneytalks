import type { SmsDraftRecord } from "../../lib/sms/sms-store.js";
import { formatDate } from "../../lib/format.js";
import { Badge } from "../ui/Badge.js";
import { Button } from "../ui/Button.js";
import { Money } from "../ui/Money.js";
import { AlertIcon, CheckIcon, PencilIcon } from "../ui/icons.js";
import {
  bankLabel,
  paymentMethodLabel,
  signedMinor,
  typeLabel,
} from "./draft-meta.js";

interface SmsDraftCardProps {
  record: SmsDraftRecord;
  busy?: boolean;
  onEdit: (record: SmsDraftRecord) => void;
  onConfirm: (record: SmsDraftRecord) => void;
  onReject: (id: string) => void;
}

export function SmsDraftCard({
  record,
  busy = false,
  onEdit,
  onConfirm,
  onReject,
}: SmsDraftCardProps) {
  const draft = record.draft;
  const requiresReview = record.discipline === "ambiguous";

  if (!draft) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-sm text-text-muted">No transaction details detected.</p>
      </div>
    );
  }

  const signed = signedMinor(draft.type, draft.amountMinor);
  const merchant = draft.merchant ?? draft.counterparty ?? "Unknown payee";

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {requiresReview ? (
            <Badge tone="warning" icon={<AlertIcon size={13} />}>
              Review required
            </Badge>
          ) : (
            <Badge tone="primary">{typeLabel(draft.type)}</Badge>
          )}
          <Badge tone="neutral">{paymentMethodLabel(draft.paymentMethodKind)}</Badge>
        </div>
        <span className="font-mono text-[11px] text-text-muted">
          {bankLabel(record.bankSource)}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-medium text-text-primary">{merchant}</p>
          {draft.counterparty && draft.counterparty !== draft.merchant ? (
            <p className="truncate text-sm text-text-muted">{draft.counterparty}</p>
          ) : null}
          <p className="mt-1 text-sm text-text-muted">
            {formatDate(draft.transactionDate)}
            {draft.accountRef ? ` · ${draft.accountRef}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <Money
            amountMinor={signed}
            currency={draft.currency}
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
          aria-label={`Edit ${merchant} draft`}
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
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => onReject(record.id)}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}
