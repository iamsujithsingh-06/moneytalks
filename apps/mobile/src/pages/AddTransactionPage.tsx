import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLedger } from "../state/ledger-context.js";
import { Button } from "../components/ui/Button.js";
import { Field, Input } from "../components/ui/form.js";
import { CheckIcon } from "../components/ui/icons.js";
import type { ManualTransactionKind } from "../lib/ledger/manual.js";

const KIND_OPTIONS: { value: ManualTransactionKind; label: string }[] = [
  { value: "expense", label: "Spend" },
  { value: "income", label: "Receive" },
  { value: "refund", label: "Refund" },
];

export function AddTransactionPage() {
  const { addManual } = useLedger();
  const navigate = useNavigate();
  const [kind, setKind] = useState<ManualTransactionKind>("expense");
  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function amountToMinor(raw: string): number {
    const cleaned = raw.trim().replace(/[₹,\s]/g, "");
    if (cleaned === "") return NaN;
    const value = Number(cleaned);
    return Math.round(value * 100);
  }

  async function handleSubmit() {
    const amountMinor = amountToMinor(amount);
    if (Number.isNaN(amountMinor) || amountMinor <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await addManual({
        kind,
        amountMinor,
        merchant: merchant || null,
        note: note || null,
        transactionDate: date || undefined,
      });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setSuccess("Added to your ledger.");
      setAmount("");
      setMerchant("");
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the transaction.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-8">
      <header className="flex items-center justify-between pb-4 pt-2">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Add transaction</h1>
          <p className="mt-1 text-sm text-text-muted">
            For cash purchases, bills, or anything you want to track manually.
          </p>
        </div>
      </header>

      {success ? (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-positive/40 bg-positive-soft/15 p-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-positive-soft text-positive">
            <CheckIcon size={16} />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-positive">{success}</p>
            <p className="text-sm text-text-muted">It will sync automatically when you are online.</p>
            <div className="mt-2 flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => navigate("/home")}>
                View dashboard
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate("/transactions")}>
                View transactions
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <form
        className="grid gap-4 rounded-xl border border-border bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
      >
        <div className="flex gap-2">
          {KIND_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setKind(opt.value)}
              className={[
                "flex-1 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors",
                kind === opt.value
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border-strong bg-field text-text-muted hover:text-text-primary",
              ].join(" ")}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <Field label="Amount" required htmlFor="amount" error={error ?? undefined}>
          <Input
            id="amount"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            error={Boolean(error)}
            onChange={(e) => {
              setAmount(e.target.value);
              setError(null);
            }}
          />
        </Field>

        <Field label="Merchant / payee" htmlFor="merchant">
          <Input
            id="merchant"
            placeholder="e.g. Grocery store"
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
          />
        </Field>

        <Field label="Date" htmlFor="date">
          <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        <Field label="Note (optional)" htmlFor="note">
          <Input
            id="note"
            placeholder="e.g. Weekly groceries in cash"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>

        <Button type="submit" size="lg" fullWidth loading={busy}>
          Add to ledger
        </Button>
        <p className="text-xs text-text-muted">
          Saved on your device and synced to the same ledger as your automatic captures.
        </p>
      </form>
    </div>
  );
}
