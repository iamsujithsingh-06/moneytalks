import { useState, type FormEvent } from "react";
import type { CategoryPublic } from "@moneytalks/types";
import { api } from "../../lib/api/index.js";
import { useApi, useAsyncTask } from "../../lib/use-api.js";
import { newClientId } from "../../lib/constants.js";
import { Alert } from "../../components/ui/page.js";
import { Button } from "../../components/ui/Button.js";
import { Field, Input, Select } from "../../components/ui/forms.js";
import { Modal, ConfirmDialog } from "../../components/ui/Modal.js";
import { EmptyState } from "../../components/ui/EmptyState.js";
import { PlusIcon } from "../../components/ui/icons.js";
import { useToast } from "../../components/ui/Toast.js";

const TYPE_LABELS: Record<string, string> = { income: "Income", expense: "Expense", transfer: "Transfer" };

export function CategoriesManager() {
  const { toast } = useToast();
  const { data, loading, error, reload } = useApi<CategoryPublic[]>(() => api.categories.list());
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<CategoryPublic | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const [name, setName] = useState("");
  const [type, setType] = useState("expense");
  const [color, setColor] = useState("#8b5cf6");
  const save = useAsyncTask(async () => {
    await api.categories.create({
      clientId: newClientId(),
      name: name.trim(),
      type: type as "income" | "expense" | "transfer",
      color,
    });
    setOpen(false);
    setName("");
    await reload();
    toast("Category added");
  });

  if (loading && !data) return <p className="text-sm text-text-muted">Loading categories…</p>;
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
        <p className="text-sm text-text-muted">Manage how transactions are organised.</p>
        <Button size="sm" onClick={() => setOpen(true)}>
          <PlusIcon size={15} /> Add
        </Button>
      </div>

      {list.length === 0 ? (
        <EmptyState title="No categories" description="Add your first category to get started." />
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {list.map((c) => (
            <li key={c.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
              <span
                className="h-3.5 w-3.5 shrink-0 rounded-full"
                style={{ background: c.color ?? "var(--mt-accent-primary)" }}
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">{c.name}</span>
              <span className="text-xs text-text-muted">{TYPE_LABELS[c.type] ?? c.type}</span>
              {c.deleted ? (
                <span className="text-xs text-text-muted">deleted</span>
              ) : (
                <button
                  type="button"
                  className="text-xs font-medium text-negative hover:underline"
                  onClick={() => setDeleting(c)}
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add category">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {save.error ? <Alert tone="error">{save.error.message}</Alert> : null}
          <Field label="Name" htmlFor="cat-name" required>
            <Input id="cat-name" required placeholder="e.g. Groceries" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Type" htmlFor="cat-type" required>
            <Select id="cat-type" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="transfer">Transfer</option>
            </Select>
          </Field>
          <Field label="Colour" htmlFor="cat-color">
            <Input id="cat-color" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-11 w-full" />
          </Field>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={save.loading}>Add</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete category"
        message={`Delete "${deleting?.name ?? ""}"? Existing transactions will keep their reference.`}
        confirmLabel="Delete"
        destructive
        busy={deletingBusy}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          setDeletingBusy(true);
          try {
            await api.categories.remove(deleting.id);
            await reload();
            toast("Category deleted");
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
