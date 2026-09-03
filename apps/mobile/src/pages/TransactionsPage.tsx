import { useMemo, useState } from "react";
import { useLedger } from "../state/ledger-context.js";
import { TransactionRow } from "../components/transactions/TransactionRow.js";
import { Button } from "../components/ui/Button.js";
import { PageLoader } from "../components/ui/feedback.js";
import { EmptyState } from "../components/ui/EmptyState.js";
import { Link } from "react-router-dom";
import { PlusIcon, RefreshIcon, WalletIcon } from "../components/ui/icons.js";
import { isAutoTransaction } from "../lib/format.js";
import type { TransactionPublic } from "@moneytalks/types";

type Filter = "all" | "auto" | "manual";

function isAuto(txn: TransactionPublic): boolean {
  return isAutoTransaction(txn);
}

export function TransactionsPage() {
  const { transactions, loading, refresh } = useLedger();
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(() => {
    if (filter === "auto") return transactions.filter(isAuto);
    if (filter === "manual") return transactions.filter((t) => !isAuto(t));
    return transactions;
  }, [transactions, filter]);

  if (loading && transactions.length === 0) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 pb-8">
        <PageLoader label="Loading transactions…" />
      </div>
    );
  }

  const filterButton = (key: Filter, label: string) => (
    <button
      key={key}
      type="button"
      onClick={() => setFilter(key)}
      className={[
        "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
        filter === key
          ? "bg-primary text-[#0b0b12]"
          : "bg-raised text-text-muted hover:text-text-primary",
      ].join(" ")}
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-8">
      <header className="flex items-center justify-between pb-4 pt-2">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Transactions</h1>
          <p className="mt-1 text-sm text-text-muted">Everything in your ledger, on device.</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Refresh"
          loading={loading}
          onClick={() => void refresh()}
        >
          <RefreshIcon size={20} />
        </Button>
      </header>

      <div className="mb-4 flex items-center gap-2">
        {filterButton("all", "All")}
        {filterButton("auto", "Automatic")}
        {filterButton("manual", "Manual")}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<WalletIcon size={26} />}
          title="No transactions here"
          description="Automatic captures from SMS/receipts and your manual entries all appear here."
          action={
            <Link to="/add">
              <Button variant="secondary" size="sm" leftIcon={<PlusIcon size={16} />}>
                Add a transaction
              </Button>
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {visible.map((txn) => (
            <li key={txn.clientId}>
              <TransactionRow txn={txn} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
