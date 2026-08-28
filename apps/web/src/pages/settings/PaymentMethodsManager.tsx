import { useState, type FormEvent } from "react";
import type { PaymentMethodPublic } from "@moneytalks/types";
import { api } from "../../lib/api/index.js";
import { useApi, useAsyncTask } from "../../lib/use-api.js";
import { newClientId } from "../../lib/constants.js";
import { PAYMENT_KIND_LABELS } from "../../lib/labels.js";
import { Alert } from "../../components/ui/page.js";
import { Button } from "../../components/ui/Button.js";
import { Field, Input, Select } from "../../components/ui/forms.js";
import { Modal, ConfirmDialog } from "../../components/ui/Modal.js";
import { EmptyState } from "../../components/ui/EmptyState.js";
import { WalletIcon, PlusIcon } from "../../components/ui/icons.js";
import { useToast } from "../../components/ui/Toast.js";

export function PaymentMethodsManager() {
  const { toast } = useToast();
  const { data, loading, error, reload } = useApi<PaymentMethodPublic[]>(() =>
    api.paymentMethods.list(),
  );
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<PaymentMethodPublic | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const [name, setName] = useState("");
  const [kind, setKind] = useState("upi");
  const save = useAsyncTask(async () => {
    await api.paymentMethods.create({
      clientId: newClientId(),
      name: name.trim(),
      kind: kind as "upi" | "card" | "bank" | "wallet",
    });
    setOpen(false);
    setName("");
    await reload();
    toast("Payment method added");
  });

  if (loading && !data) return <p className="text-sm text-text-muted">Loading payment methods…</p>;
  if (error && !data) return <Alert tone="error">{error.message}</Alert>;

  const list = data ?? [];

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    void save.run();
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-text-muted">The accounts & apps you pay with.</p>
        <Button size="sm" onClick={() => setOpen(true)}>
          <PlusIcon size={15} /> Add
        </Button>
      </div>

      {list.length === 0 ? (
        <EmptyState
          title="No payment methods"
          description="Add a UPI handle, card, bank or wallet."
          icon={<WalletIcon size={24} />}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {list.map((m) => (
            <li key={m.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                <WalletIcon size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-primary">{m.name}</p>
                <p className="text-xs text-text-muted">
                  {PAYMENT_KIND_LABELS[m.kind] ?? m.kind}
                  {m.maskedNumber ? ` · ${m.maskedNumber}` : ""}
                </p>
              </div>
              {m.deleted ? (
                <span className="text-xs text-text-muted">deleted</span>
              ) : (
                <button
                  type="button"
                  className="text-xs font-medium text-negative hover:underline"
                  onClick={() => setDeleting(m)}
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add payment method">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {save.error ? <Alert tone="error">{save.error.message}</Alert> : null}
          <Field label="Name" htmlFor="pm-name" required>
            <Input id="pm-name" required placeholder="e.g. HDFC Credit Card" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Kind" htmlFor="pm-kind">
            <Select id="pm-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="bank">Bank</option>
              <option value="wallet">Wallet</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={save.loading}>Add</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete payment method"
        message={`Delete "${deleting?.name ?? ""}"?`}
        confirmLabel="Delete"
        destructive
        busy={deletingBusy}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          setDeletingBusy(true);
          try {
            await api.paymentMethods.remove(deleting.id);
            await reload();
            toast("Payment method deleted");
          } catch (err) {
            toast((err as Error).message, "error");
          } finally {
            setDeletingBusy(false);
          }
        }}
      />
    </div>
  );
}
