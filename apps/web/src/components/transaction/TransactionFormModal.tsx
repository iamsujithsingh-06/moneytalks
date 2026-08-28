import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { CategoryPublic, PaymentMethodPublic, TransactionPublic } from "@moneytalks/types";
import { TransactionType } from "@moneytalks/shared";
import { toMinorUnits } from "@moneytalks/shared";
import { api } from "../../lib/api/index.js";
import { useApi } from "../../lib/use-api.js";
import { newClientId, DEFAULT_CURRENCY } from "../../lib/constants.js";
import { Field, Input, Select, Textarea } from "../ui/forms.js";
import { Button } from "../ui/Button.js";
import { Modal } from "../ui/Modal.js";
import { Alert } from "../ui/page.js";

interface FormState {
  type: string;
  amount: string;
  date: string;
  merchant: string;
  note: string;
  categoryId: string;
  paymentMethodId: string;
}

function toForm(tx: TransactionPublic): FormState {
  const decimals = 2;
  return {
    type: tx.type,
    amount: (tx.amountMinor / 10 ** decimals).toFixed(decimals),
    date: tx.transactionDate.slice(0, 10),
    merchant: tx.merchant ?? "",
    note: tx.note ?? "",
    categoryId: tx.categoryId ?? "",
    paymentMethodId: tx.paymentMethodId ?? "",
  };
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TransactionFormModal({
  open,
  onClose,
  tx,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  tx: TransactionPublic | null;
  onSaved: () => void | Promise<void>;
}) {
  const editing = Boolean(tx);
  const [form, setForm] = useState<FormState>(() =>
    tx ? toForm(tx) : { type: "expense", amount: "", date: todayStr(), merchant: "", note: "", categoryId: "", paymentMethodId: "" },
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(tx ? toForm(tx) : { type: "expense", amount: "", date: todayStr(), merchant: "", note: "", categoryId: "", paymentMethodId: "" });
      setError(null);
    }
  }, [open, tx]);

  const cats = useApi<CategoryPublic[]>(() => api.categories.list());
  const methods = useApi<PaymentMethodPublic[]>(() => api.paymentMethods.list());

  const set = (k: keyof FormState) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Categories relevant to the selected type (expense budgets etc.)
  const filteredCats = useMemo(() => {
    if (!cats.data) return [];
    return cats.data.filter(
      (c) => c.status === "active" && c.type === form.type.toLowerCase(),
    );
  }, [cats.data, form.type]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    let amountMinor: number;
    try {
      amountMinor = toMinorUnits(form.amount, DEFAULT_CURRENCY);
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    if (!form.date) {
      setError("Transaction date is required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        type: form.type as string as (typeof TransactionType)["Expense"],
        amountMinor,
        currency: DEFAULT_CURRENCY,
        transactionDate: form.date,
        merchant: form.merchant.trim() || undefined,
        note: form.note.trim() || undefined,
        categoryId: form.categoryId || undefined,
        paymentMethodId: form.paymentMethodId || undefined,
      };
      if (tx) {
        await api.transactions.update(tx.id, payload);
      } else {
        await api.transactions.create({ ...payload, clientId: newClientId() });
      }
      await onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit transaction" : "Add transaction"}
      description={editing ? "Update the details below." : "Record a new income or expense."}
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? <Alert tone="error">{error}</Alert> : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Type" htmlFor="tx-type" required>
            <Select id="tx-type" value={form.type} onChange={(e) => set("type")(e.target.value)}>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
              <option value="refund">Refund</option>
              <option value="transfer">Transfer</option>
              <option value="adjustment">Adjustment</option>
            </Select>
          </Field>
          <Field label="Amount" htmlFor="tx-amount" required>
            <Input
              id="tx-amount"
              inputMode="decimal"
              required
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => set("amount")(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" htmlFor="tx-date" required>
            <Input
              id="tx-date"
              type="date"
              required
              value={form.date}
              onChange={(e) => set("date")(e.target.value)}
            />
          </Field>
          <Field label="Merchant" htmlFor="tx-merchant">
            <Input
              id="tx-merchant"
              placeholder="e.g. Swiggy"
              value={form.merchant}
              onChange={(e) => set("merchant")(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Category" htmlFor="tx-category">
            <Select
              id="tx-category"
              value={form.categoryId}
              onChange={(e) => set("categoryId")(e.target.value)}
            >
              <option value="">No category</option>
              {filteredCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Payment method" htmlFor="tx-method">
            <Select
              id="tx-method"
              value={form.paymentMethodId}
              onChange={(e) => set("paymentMethodId")(e.target.value)}
            >
              <option value="">None</option>
              {(methods.data ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Note" htmlFor="tx-note">
          <Textarea
            id="tx-note"
            placeholder="Optional details…"
            value={form.note}
            onChange={(e) => set("note")(e.target.value)}
          />
        </Field>

        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {editing ? "Save changes" : "Add transaction"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
