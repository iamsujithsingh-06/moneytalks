import { Link } from "react-router-dom";
import { useLedger } from "../state/ledger-context.js";
import { useSms } from "../state/sms-context.js";
import { useSync } from "../state/sync-context.js";
import { TransactionRow } from "../components/transactions/TransactionRow.js";
import { Money } from "../components/ui/Money.js";
import { Badge } from "../components/ui/Badge.js";
import { Button } from "../components/ui/Button.js";
import { PageLoader, ErrorCard } from "../components/ui/feedback.js";
import { EmptyState } from "../components/ui/EmptyState.js";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  HandCoinsIcon,
  InboxIcon,
  PlusIcon,
  RefreshIcon,
  WalletIcon,
} from "../components/ui/icons.js";
import { syncStatusLabel } from "../lib/ledger/sync-label.js";

export function HomePage() {
  const { data, loading, refresh } = useLedger();
  const { capturedCount } = useSms();
  const { snapshot } = useSync();

  if (loading && !data) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 pb-8">
        <PageLoader label="Loading your dashboard…" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 pb-8">
        <ErrorCard message="Could not load your dashboard." onRetry={() => void refresh()} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-8">
      <header className="flex items-center justify-between pb-4 pt-2">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
          <p className="mt-1 text-sm text-text-muted">Your money, on the go.</p>
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

      <div className="space-y-6">
        <section className="rounded-2xl bg-gradient-to-br from-primary to-primary-strong p-5 text-[#0b0b12]">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm font-medium opacity-80">
              <WalletIcon size={16} />
              Balance
            </span>
            {capturedCount > 0 ? (
              <Link to="/reviews" className="rounded-full bg-[#0b0b12]/15 px-2.5 py-1 text-xs font-semibold">
                {capturedCount} to review
              </Link>
            ) : null}
          </div>
          <Money amountMinor={data.balance} currency="INR" size="lg" className="mt-2 text-[#0b0b12]" />
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#0b0b12]/15 pt-3">
            <div>
              <p className="text-xs font-medium opacity-70">In this month</p>
              <Money
                amountMinor={data.monthIncome}
                currency="INR"
                signed
                className="text-sm text-[#0b0b12]"
              />
            </div>
            <div>
              <p className="text-xs font-medium opacity-70">Spent</p>
              <Money
                amountMinor={-data.monthExpense}
                currency="INR"
                signed
                className="text-sm text-[#0b0b12]"
              />
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3" aria-label="Actions">
          <Link to="/add">
            <Button variant="primary" size="lg" fullWidth leftIcon={<PlusIcon size={18} />}>
              Add
            </Button>
          </Link>
          <Link to="/reviews">
            <Button variant="secondary" size="lg" fullWidth leftIcon={<InboxIcon size={18} />}>
              Review
            </Button>
          </Link>
        </section>

        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-text-secondary">Today</h2>
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-negative-soft text-negative">
                <ArrowDownIcon size={16} />
              </span>
              <div>
                <p className="text-sm font-medium text-text-primary">Spent</p>
                <Money amountMinor={data.todayOutflow} currency="INR" size="sm" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-positive-soft text-positive">
                <ArrowUpIcon size={16} />
              </span>
              <div>
                <p className="text-sm font-medium text-text-primary">Activity</p>
                <p className="text-sm font-semibold tabular-nums text-text-primary">{data.todayCount}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-secondary">Top spending this month</h2>
          </div>
          {data.topSpend.length === 0 ? (
            <p className="mt-3 text-sm text-text-muted">No spending yet this month.</p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {data.topSpend.map((item) => (
                <li key={item.name} className="flex items-center justify-between">
                  <span className="flex items-center gap-2 truncate text-sm text-text-primary">
                    <HandCoinsIcon size={16} className="text-text-muted" />
                    <span className="truncate">{item.name}</span>
                    <span className="text-xs text-text-muted">×{item.count}</span>
                  </span>
                  <Money amountMinor={item.totalMinor} currency="INR" size="sm" tone="negative" />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-secondary">Recent transactions</h2>
            <Link to="/transactions" className="text-sm font-medium text-primary">
              View all
            </Link>
          </div>
          {data.recent.length === 0 ? (
            <EmptyState
              icon={<WalletIcon size={26} />}
              title="No transactions yet"
              description="Capture a bank SMS or add a cash purchase to see it here."
              action={
                <Link to="/add">
                  <Button variant="secondary" size="sm" leftIcon={<PlusIcon size={16} />}>
                    Add a transaction
                  </Button>
                </Link>
              }
            />
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {data.recent.map((txn) => (
                <li key={txn.clientId} className="-mx-4">
                  <TransactionRow txn={txn} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex items-center justify-between rounded-xl border border-border bg-surface p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-primary">Sync status</p>
            <p className="text-sm text-text-muted">
              {data.pendingSyncCount > 0
                ? `${data.pendingSyncCount} pending change${data.pendingSyncCount > 1 ? "s" : ""} to sync`
                : "Up to date"}
            </p>
          </div>
          <Badge tone={data.pendingSyncCount > 0 ? "warning" : "positive"}>
            {syncStatusLabel(snapshot.status)}
          </Badge>
        </section>
      </div>
    </div>
  );
}
