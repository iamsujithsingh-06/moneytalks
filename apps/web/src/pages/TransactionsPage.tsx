import { useCallback, useEffect, useState } from "react";
import type { TransactionListResult, TransactionPublic } from "@moneytalks/types";
import { offlineStore, syncEngine } from "../lib/offline/index.js";
import { DEFAULT_CURRENCY } from "../lib/constants.js";
import { formatDate, formatMoney } from "../lib/format.js";
import { TYPE_LABELS } from "../lib/labels.js";
import { PageHeader, ErrorState, LoadingBlock } from "../components/ui/page.js";
import { Card } from "../components/ui/Card.js";
import { Badge } from "../components/ui/Badge.js";
import { EmptyState } from "../components/ui/EmptyState.js";
import { Button } from "../components/ui/Button.js";
import { Input, Select } from "../components/ui/forms.js";
import { Money } from "../components/ui/Money.js";
import { TransactionFormModal } from "../components/transaction/TransactionFormModal.js";
import { ConfirmDialog } from "../components/ui/Modal.js";
import { PlusIcon, SearchIcon } from "../components/ui/icons.js";
import { useToast } from "../components/ui/Toast.js";

interface Filters {
  q: string;
  type: string;
  direction: string;
}

export function TransactionsPage() {
  const { toast } = useToast();
  const [filters, setFilters] = useState<Filters>({ q: "", type: "", direction: "" });
  const [result, setResult] = useState<TransactionListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionPublic | null>(null);
  const [deleting, setDeleting] = useState<TransactionPublic | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const load = useCallback(async (f: Filters) => {
    setLoading(true);
    setError(null);
    try {
      const all = await offlineStore.list("transactions");
      const q = f.q.trim().toLowerCase();
      const filtered = all
        .filter((t) => {
          if (f.type && t.type !== f.type) return false;
          if (f.direction && t.direction !== f.direction) return false;
          if (q) {
            const hay = `${t.merchant ?? ""} ${t.note ?? ""} ${TYPE_LABELS[t.type] ?? t.type}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        })
        .sort((a, b) => {
          const byDate = String(b.transactionDate).localeCompare(String(a.transactionDate));
          return byDate !== 0 ? byDate : String(b.createdAt).localeCompare(String(a.createdAt));
        });
      setResult({ items: filtered, nextCursor: null, total: filtered.length });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setResult(null);
    void load(filters);
  }, [filters, load]);

  const onSaved = async () => {
    toast(editing ? "Transaction updated" : "Transaction added");
    setResult(null);
    await load(filters);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await offlineStore.remove("transactions", deleting.clientId);
      void syncEngine.sync("manual");
      toast("Transaction deleted");
      setDeleting(null);
      setResult((prev) =>
        prev ? { ...prev, items: prev.items.filter((t) => t.clientId !== deleting.clientId) } : prev,
      );
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setDeletingBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        description="Every inflow and outflow, in one place."
        actions={
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
            <PlusIcon size={16} /> Add
          </Button>
        }
      />

      {/* Filters */}
      <Card padded={false}>
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
                <SearchIcon size={16} />
              </span>
              <Input
                className="pl-9"
                placeholder="Search merchant or note"
                value={filters.q}
                onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              />
            </div>
          </div>
          <Select
            value={filters.type}
            onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
          >
            <option value="">All types</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
          <Select
            value={filters.direction}
            onChange={(e) => setFilters((f) => ({ ...f, direction: e.target.value }))}
          >
            <option value="">Both directions</option>
            <option value="inflow">Inflow</option>
            <option value="outflow">Outflow</option>
          </Select>
        </div>
      </Card>

      {error ? <ErrorState message={error} retry={() => void load(filters)} /> : null}

      {!error && result && result.items.length === 0 ? (
        <EmptyState
          title="No transactions found"
          description="Try adjusting your filters, or add a new transaction."
          action={
            <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
              <PlusIcon size={16} /> Add transaction
            </Button>
          }
        />
      ) : null}

      {!error && result && result.items.length > 0 ? (
        <Card padded={false}>
          <ul className="divide-y divide-border">
            {result.items.map((t) => (
              <li
                key={t.id}
                className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-raised/60 sm:px-5"
                onClick={() => { setEditing(t); setFormOpen(true); }}
              >
                <span
                  className={
                    t.direction === "inflow"
                      ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-positive-soft text-positive"
                      : "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-negative-soft text-negative"
                  }
                >
                  {t.direction === "inflow" ? "↓" : "↑"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {t.merchant ?? TYPE_LABELS[t.type] ?? t.type}
                    </p>
                    <Badge tone={t.type === "expense" ? "negative" : t.type === "income" ? "positive" : "neutral"}>
                      {TYPE_LABELS[t.type] ?? t.type}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-text-muted">
                    {formatDate(t.transactionDate)}
                    {t.note ? ` · ${t.note}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="hidden shrink-0 text-xs font-medium text-negative hover:underline sm:block"
                  onClick={(e) => { e.stopPropagation(); setDeleting(t); }}
                >
                  Delete
                </button>
                <Money
                  amountMinor={t.amountMinor}
                  currency={DEFAULT_CURRENCY}
                  size="sm"
                  signed={t.direction === "inflow"}
                  className="whitespace-nowrap"
                />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {loading && !result ? <LoadingBlock label="Loading transactions…" /> : null}

      <TransactionFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        tx={editing}
        onSaved={onSaved}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete transaction"
        message={`Delete ${deleting ? formatMoney(deleting.amountMinor, DEFAULT_CURRENCY) : ""}? This can't be undone.`}
        confirmLabel="Delete"
        destructive
        busy={deletingBusy}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

