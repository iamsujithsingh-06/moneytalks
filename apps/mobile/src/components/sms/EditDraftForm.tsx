import { useEffect, useState } from "react";
import { minorUnitsPerMajor } from "@moneytalks/shared";
import type { DraftTransactionType, SmsPaymentMethodKind } from "@moneytalks/sms";
import type { SmsDraftEdits } from "../../lib/sms/ingest.js";
import type { SmsDraftRecord } from "../../lib/sms/sms-store.js";
import { Button } from "../ui/Button.js";
import { Badge } from "../ui/Badge.js";
import { AlertIcon } from "../ui/icons.js";
import { PAYMENT_METHOD_OPTIONS, TYPE_OPTIONS } from "./draft-meta.js";

interface EditDraftFormProps {
  record: SmsDraftRecord;
  busy?: boolean;
  onSave: (edits: SmsDraftEdits) => void;
  onCancel: () => void;
}

function fieldClass(hasError: boolean): string {
  return [
    "w-full h-12 rounded-lg border bg-field px-3 text-base text-text-primary placeholder:text-text-muted",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mt-focus-ring)]",
    hasError ? "border-negative" : "border-border-strong",
  ].join(" ");
}

export function EditDraftForm({ record, busy = false, onSave, onCancel }: EditDraftFormProps) {
  const draft = record.draft;
  const [type, setType] = useState<DraftTransactionType>(draft?.type ?? "expense");
  const [amount, setAmount] = useState<string>(() =>
    draft ? (draft.amountMinor / 10 ** minorUnitsPerMajor(draft.currency)).toString() : "",
  );
  const [merchant, setMerchant] = useState(draft?.merchant ?? "");
  const [counterparty, setCounterparty] = useState(draft?.counterparty ?? "");
  const [date, setDate] = useState(draft?.transactionDate.slice(0, 10) ?? "");
  const [pageDraft, setPaymentMethod] = useState<SmsPaymentMethodKind>(
    draft?.paymentMethodKind ?? null,
  );
  const [note, setNote] = useState("");
  const [amountError, setAmountError] = useState(false);

  useEffect(() => {
    if (!draft) return;
    setType(draft.type);
    setAmount((draft.amountMinor / 10 ** minorUnitsPerMajor(draft.currency)).toString());
    setMerchant(draft.merchant ?? "");
    setCounterparty(draft.counterparty ?? "");
    setDate(draft.transactionDate.slice(0, 10));
    setPaymentMethod(draft.paymentMethodKind ?? null);
  }, [record.id]);

  function parseAmount(): number | null {
    if (amount.trim() === "") return null;
    const raw = Number(amount.trim());
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return Math.round(raw * 10 ** minorUnitsPerMajor(draft?.currency ?? "INR"));
  }

  function handleSave() {
    const minor = parseAmount();
    setAmountError(minor === null);
    if (minor === null) return;
    onSave({
      type,
      amountMinor: minor,
      merchant: merchant.trim() === "" ? null : merchant.trim(),
      counterparty: counterparty.trim() === "" ? null : counterparty.trim(),
      transactionDate: date || undefined,
      paymentMethodKind: pageDraft,
      note: note.trim() === "" ? undefined : note.trim(),
    });
  }

  if (!draft) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-sm text-text-muted">Nothing to edit — no transaction was parsed.</p>
        <Button variant="ghost" size="sm" className="mt-3" onClick={onCancel}>
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Review details</h3>
        <Badge tone="primary">{draft.currency}</Badge>
      </div>

      {draft.messageHash ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-warning-soft/30 p-3 text-xs text-text-secondary">
          <span className="mt-0.5 text-warning">
            <AlertIcon size={15} />
          </span>
          <p>
            Parsed automatically from your SMS. Correct anything below before saving; your SMS
            body itself is never uploaded.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4">
        <div>
          <label htmlFor="mt-edit-type" className="mb-1.5 block text-sm font-medium text-text-secondary">
            Type
          </label>
          <div className="flex gap-2" role="radiogroup" aria-label="Transaction type">
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={type === opt.value}
                onClick={() => setType(opt.value)}
                className={[
                  "inline-flex h-11 flex-1 items-center justify-center rounded-lg border text-sm font-medium transition-colors",
                  type === opt.value
                    ? "border-[var(--mt-accent-primary)] bg-primary-soft text-primary"
                    : "border-border-strong bg-transparent text-text-secondary",
                ].join(" ")}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="mt-edit-amount" className="mb-1.5 block text-sm font-medium text-text-secondary">
            Amount ({draft.currency})
          </label>
          <input
            id="mt-edit-amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            aria-invalid={amountError}
            className={fieldClass(amountError)}
          />
          {amountError ? (
            <p className="mt-1 text-xs text-negative">Enter a valid amount greater than 0.</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="mt-edit-merchant" className="mb-1.5 block text-sm font-medium text-text-secondary">
            Merchant / payee
          </label>
          <input
            id="mt-edit-merchant"
            type="text"
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            placeholder="e.g. SWIGGY"
            className={fieldClass(false)}
          />
        </div>

        <div>
          <label htmlFor="mt-edit-counterparty" className="mb-1.5 block text-sm font-medium text-text-secondary">
            Counterparty {draft.counterparty ? "(optional)" : ""}
          </label>
          <input
            id="mt-edit-counterparty"
            type="text"
            value={counterparty}
            onChange={(e) => setCounterparty(e.target.value)}
            placeholder="e.g. UPI sender"
            className={fieldClass(false)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="mt-edit-date" className="mb-1.5 block text-sm font-medium text-text-secondary">
              Date
            </label>
            <input
              id="mt-edit-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={fieldClass(false)}
            />
          </div>
          <div>
            <label htmlFor="mt-edit-method" className="mb-1.5 block text-sm font-medium text-text-secondary">
              Payment method
            </label>
            <select
              id="mt-edit-method"
              value={pageDraft ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setPaymentMethod(v === "" ? null : (v as SmsPaymentMethodKind));
              }}
              className={fieldClass(false)}
            >
              {PAYMENT_METHOD_OPTIONS.map((opt) => (
                <option key={opt.label} value={opt.value ?? ""}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="mt-edit-note" className="mb-1.5 block text-sm font-medium text-text-secondary">
            Note {note ? "" : "(optional)"}
          </label>
          <input
            id="mt-edit-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note"
            className={fieldClass(false)}
          />
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2">
        <Button variant="primary" size="lg" fullWidth loading={busy} onClick={handleSave}>
          Save & confirm
        </Button>
        <Button variant="ghost" size="lg" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
