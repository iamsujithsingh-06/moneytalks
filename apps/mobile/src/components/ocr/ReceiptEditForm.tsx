import { useState } from "react";
import { minorUnitsPerMajor } from "@moneytalks/shared";
import type { PaymentMethod, ReceiptTransactionType } from "@moneytalks/ocr";
import type { OcrDraftEdits } from "../../lib/ocr/ocr-ingest.js";
import type { OcrDraftRecord } from "../../lib/ocr/ocr-store.js";
import { Button } from "../ui/Button.js";
import { Badge } from "../ui/Badge.js";
import { AlertIcon } from "../ui/icons.js";
import { PAYMENT_METHOD_OPTIONS, TYPE_OPTIONS } from "../../lib/ocr/draft-meta.js";

const CURRENCY_OPTIONS = ["INR", "USD", "EUR", "GBP"];

interface ReceiptEditFormProps {
  record: OcrDraftRecord;
  busy?: boolean;
  onSave: (edits: OcrDraftEdits) => void;
  onCancel: () => void;
}

function fieldClass(hasError: boolean): string {
  return [
    "w-full h-12 rounded-lg border bg-field px-3 text-base text-text-primary placeholder:text-text-muted",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mt-focus-ring)]",
    hasError ? "border-negative" : "border-border-strong",
  ].join(" ");
}

export function ReceiptEditForm({ record, busy = false, onSave, onCancel }: ReceiptEditFormProps) {
  const draft = record.draft;
  const [type, setType] = useState<ReceiptTransactionType>(draft?.type.value ?? "expense");
  const [currency, setCurrency] = useState<string>(draft?.currency.value ?? "INR");
  const [amount, setAmount] = useState<string>(() =>
    draft ? (draft.amountMinor.value / 10 ** minorUnitsPerMajor(draft.currency.value)).toString() : "",
  );
  const [merchant, setMerchant] = useState<string>(draft?.merchant.value ?? "");
  const [dateValue, setDateValue] = useState<string>(draft?.transactionDate.value ?? "");
  const [method, setMethod] = useState<PaymentMethod>(draft?.paymentMethod.value ?? null);
  const [amountError, setAmountError] = useState(false);

  function parseAmount(): number | null {
    if (amount.trim() === "") return null;
    const raw = Number(amount.trim());
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return Math.round(raw * 10 ** minorUnitsPerMajor(currency));
  }

  function handleSave() {
    const minor = parseAmount();
    setAmountError(minor === null);
    if (minor === null) return;
    onSave({
      type,
      amountMinor: minor,
      currency,
      merchant: merchant.trim() === "" ? null : merchant.trim(),
      transactionDate: dateValue || undefined,
      paymentMethod: method,
    });
  }

  if (!draft) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-sm text-text-muted">Nothing to edit — no receipt was parsed.</p>
        <Button variant="ghost" size="sm" className="mt-3" onClick={onCancel}>
          Back
        </Button>
      </div>
    );
  }

  const needsReview = draft.needsReview || draft.amountMinor.needsReview;

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Review receipt details</h3>
        <Badge tone="primary">{currency}</Badge>
      </div>

      {needsReview ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-warning-soft/30 p-3 text-xs text-text-secondary">
          <span className="mt-0.5 text-warning">
            <AlertIcon size={15} />
          </span>
          <p>
            Parsed from your receipt, but one or more fields need your confirmation before saving.
            The raw receipt text never leaves your device unless you confirm it.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4">
        <div>
          <label htmlFor="mt-ocr-type" className="mb-1.5 block text-sm font-medium text-text-secondary">
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="mt-ocr-amount" className="mb-1.5 block text-sm font-medium text-text-secondary">
              Amount ({currency})
            </label>
            <input
              id="mt-ocr-amount"
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
            <label htmlFor="mt-ocr-currency" className="mb-1.5 block text-sm font-medium text-text-secondary">
              Currency
            </label>
            <select
              id="mt-ocr-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={fieldClass(false)}
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="mt-ocr-merchant" className="mb-1.5 block text-sm font-medium text-text-secondary">
            Merchant
          </label>
          <input
            id="mt-ocr-merchant"
            type="text"
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            placeholder="e.g. Cafe Zeta"
            className={fieldClass(false)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="mt-ocr-date" className="mb-1.5 block text-sm font-medium text-text-secondary">
              Date
            </label>
            <input
              id="mt-ocr-date"
              type="date"
              value={dateValue}
              onChange={(e) => setDateValue(e.target.value)}
              className={fieldClass(false)}
            />
          </div>
          <div>
            <label htmlFor="mt-ocr-method" className="mb-1.5 block text-sm font-medium text-text-secondary">
              Payment method
            </label>
            <select
              id="mt-ocr-method"
              value={method ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setMethod(v === "" ? null : (v as PaymentMethod));
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
