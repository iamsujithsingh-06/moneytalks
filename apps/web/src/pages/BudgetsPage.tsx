import { useEffect, useState, type FormEvent } from "react";
import type { BudgetPublic, CategoryPublic } from "@moneytalks/types";
import { BudgetPeriod, BudgetScope, BudgetStatus, toMinorUnits } from "@moneytalks/shared";
import { api } from "../lib/api/index.js";
import { useApi } from "../lib/use-api.js";
import { newClientId, DEFAULT_CURRENCY } from "../lib/constants.js";
import { formatCompact, formatDate } from "../lib/format.js";
import { PERIOD_LABELS, BUDGET_ALERT_LABELS } from "../lib/labels.js";
import { PageHeader, ErrorState, LoadingBlock, Alert } from "../components/ui/page.js";
import { Card } from "../components/ui/Card.js";
import { ProgressBar } from "../components/ui/Progress.js";
import { Badge } from "../components/ui/Badge.js";
import { EmptyState } from "../components/ui/EmptyState.js";
import { Button } from "../components/ui/Button.js";
import { Field, Input, Select } from "../components/ui/forms.js";
import { Modal, ConfirmDialog } from "../components/ui/Modal.js";
import { PlusIcon } from "../components/ui/icons.js";
import { useToast } from "../components/ui/Toast.js";

function budgetTone(b: BudgetPublic): "ok" | "warning" | "over" {
  return b.alertStatus === "over" ? "over" : b.alertStatus === "warning" ? "warning" : "ok";
}

export function BudgetsPage() {
  const { toast } = useToast();
  const { data: budgets, loading, error, reload } = useApi<BudgetPublic[]>(() => api.budgets.list());
  const cats = useApi<CategoryPublic[]>(() => api.categories.list("expense"));

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BudgetPublic | null>(null);
  const [deleting, setDeleting] = useState<BudgetPublic | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  if (loading) return <LoadingBlock label="Loading budgets…" />;
  if (error) return <ErrorState message={error.message} retry={() => void reload()} />;

  const list = budgets ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Budgets"
        description="Set limits and keep your spending on track."
        actions={
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
            <PlusIcon size={16} /> New budget
          </Button>
        }
      />

      {list.length === 0 ? (
        <EmptyState
          title="No budgets yet"
          description="Create a monthly or weekly budget to start controlling spending."
          action={
            <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
              <PlusIcon size={16} /> Create budget
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {list.map((b) => (
            <Card key={b.id} padded={false}>
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary">
                      {categoryName(cats.data ?? [], b)}
                    </h3>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {PERIOD_LABELS[b.period] ?? b.period}
                      {b.periodAnchor ? ` · from ${formatDate(b.periodAnchor)}` : ""}
                    </p>
                  </div>
                  <Badge
                    tone={b.alertStatus === "over" ? "negative" : b.alertStatus === "warning" ? "warning" : "positive"}
                  >
                    {BUDGET_ALERT_LABELS[b.alertStatus] ?? b.alertStatus}
                  </Badge>
                </div>

                <div className="mt-4">
                  <ProgressBar percent={b.percent} tone={budgetTone(b)} />
                  <div className="mt-2 flex items-baseline justify-between text-sm">
                    <span className="tabular-nums font-medium text-text-primary">
                      {formatCompact(b.spentMinor, b.currency)}
                    </span>
                    <span className="tabular-nums text-xs text-text-muted">
                      of {formatCompact(b.allocatedMinor, b.currency)} · {Math.round(b.percent)}%
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                  <span className="text-xs text-text-muted">
                    {b.status === "paused" ? "Paused" : "Active"}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => { setEditing(b); setFormOpen(true); }}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleting(b)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <BudgetFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        budget={editing}
        categories={cats.data ?? []}
        onSaved={async () => {
          toast(editing ? "Budget updated" : "Budget created");
          await reload();
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete budget"
        message="Delete this budget? This can't be undone."
        confirmLabel="Delete"
        destructive
        busy={deletingBusy}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          setDeletingBusy(true);
          try {
            await api.budgets.remove(deleting.id);
            setDeleting(null);
            await reload();
            toast("Budget deleted");
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

function categoryName(cats: CategoryPublic[], b: BudgetPublic): string {
  if (!b.categoryId) return "Overall budget";
  return cats.find((c) => c.id === b.categoryId)?.name ?? "Category budget";
}

function BudgetFormModal({
  open,
  onClose,
  budget,
  categories,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  budget: BudgetPublic | null;
  categories: CategoryPublic[];
  onSaved: () => void | Promise<void>;
}) {
  const editing = Boolean(budget);
  const [scope, setScope] = useState<string>(BudgetScope.Category);
  const [categoryId, setCategoryId] = useState("");
  const [period, setPeriod] = useState<string>(BudgetPeriod.Monthly);
  const [allocated, setAllocated] = useState("");
  const [status, setStatus] = useState<string>(BudgetStatus.Active);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setScope(budget?.scope ?? BudgetScope.Category);
      setCategoryId(budget?.categoryId ?? "");
      setPeriod(budget?.period ?? BudgetPeriod.Monthly);
      setAllocated(budget ? (budget.allocatedMinor / 100).toFixed(2) : "");
      setStatus(budget?.status ?? BudgetStatus.Active);
      setError(null);
    }
  }, [open, budget]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (scope === BudgetScope.Category && !categoryId) {
      setError("Choose a category for this budget.");
      return;
    }
    let allocatedMinor: number;
    try {
      allocatedMinor = toMinorUnits(allocated, DEFAULT_CURRENCY);
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    setSaving(true);
    try {
      const base = {
        scope: scope as "category" | "overall",
        categoryId: scope === BudgetScope.Category ? categoryId : undefined,
        period: period as "weekly" | "monthly" | "yearly" | "custom",
        allocatedMinor,
        currency: DEFAULT_CURRENCY,
        status: status as "active" | "paused" | "completed",
      };
      if (budget) {
        await api.budgets.update(budget.id, base);
      } else {
        await api.budgets.create({ ...base, clientId: newClientId() });
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
      title={editing ? "Edit budget" : "New budget"}
      description="Set a limit for a category or your overall spending."
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? <Alert tone="error">{error}</Alert> : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Scope" htmlFor="bg-scope" required>
            <Select
              id="bg-scope"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              <option value={BudgetScope.Overall}>Overall</option>
              <option value={BudgetScope.Category}>Category</option>
            </Select>
          </Field>
          {scope === BudgetScope.Category ? (
            <Field label="Category" htmlFor="bg-category" required>
              <Select
                id="bg-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">Select category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Period" htmlFor="bg-period" required>
              <Select id="bg-period" value={period} onChange={(e) => setPeriod(e.target.value)}>
                <option value={BudgetPeriod.Weekly}>Weekly</option>
                <option value={BudgetPeriod.Monthly}>Monthly</option>
                <option value={BudgetPeriod.Yearly}>Yearly</option>
              </Select>
            </Field>
          )}
        </div>

        {scope === BudgetScope.Category ? (
          <Field label="Period" htmlFor="bg-period" required>
            <Select id="bg-period" value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value={BudgetPeriod.Weekly}>Weekly</option>
              <option value={BudgetPeriod.Monthly}>Monthly</option>
              <option value={BudgetPeriod.Yearly}>Yearly</option>
            </Select>
          </Field>
        ) : null}

        <Field label="Amount" htmlFor="bg-amount" required>
          <Input
            id="bg-amount"
            inputMode="decimal"
            required
            placeholder="0.00"
            value={allocated}
            onChange={(e) => setAllocated(e.target.value)}
          />
        </Field>

        <Field label="Status" htmlFor="bg-status">
          <Select id="bg-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value={BudgetStatus.Active}>Active</option>
            <option value={BudgetStatus.Paused}>Paused</option>
          </Select>
        </Field>

        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {editing ? "Save changes" : "Create budget"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

