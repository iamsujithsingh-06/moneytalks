import { Link } from "react-router-dom";
import type { BudgetPublic, DashboardSummary, TransactionPublic } from "@moneytalks/types";
import { api } from "../lib/api/index.js";
import { useApi } from "../lib/use-api.js";
import { DEFAULT_CURRENCY } from "../lib/constants.js";
import { formatCompact, formatDate } from "../lib/format.js";
import { TYPE_LABELS } from "../lib/labels.js";
import { PageHeader, ErrorState, LoadingBlock } from "../components/ui/page.js";
import { Card, CardHeader } from "../components/ui/Card.js";
import { StatCard } from "../components/ui/StatCard.js";
import { Money } from "../components/ui/Money.js";
import { ProgressBar } from "../components/ui/Progress.js";
import { EmptyState } from "../components/ui/EmptyState.js";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronRightIcon,
  PieIcon,
} from "../components/ui/icons.js";

export function DashboardPage() {
  const { data, loading, error, reload } = useApi<DashboardSummary>(() =>
    api.dashboard.summary(),
  );

  if (loading && !data) return <LoadingBlock label="Loading your overview…" />;
  if (error && !data)
    return <ErrorState message={error.message} retry={() => void reload()} />;

  if (!data) return null;
  const c = DEFAULT_CURRENCY;

  return (
    <div className="space-y-6">
      <PageHeader title="Welcome back" description="Here's your money at a glance." />

      {/* Hero balance card */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary via-primary/90 to-primary-strong p-6 text-white shadow-card sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-white/5" />
        <p className="text-sm font-medium text-white/80">Total balance</p>
        <Money
          amountMinor={data.balance}
          currency={c}
          size="xl"
          className="mt-2 !text-white drop-shadow-sm"
          tone="inherit"
        />
        <div className="mt-5 flex flex-wrap gap-4 text-sm">
          <div>
            <span className="text-white/70">Income</span>
            <Money amountMinor={data.monthIncome} currency={c} tone="inherit" className="ml-2 !text-white" />
          </div>
          <div>
            <span className="text-white/70">Spent</span>
            <Money amountMinor={data.monthExpense} currency={c} tone="inherit" className="ml-2 !text-white" />
          </div>
        </div>
      </section>

      {/* Month summary stats */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Income"
          tone="positive"
          icon={<ArrowUpIcon size={16} />}
          value={<Money amountMinor={data.monthIncome} currency={c} />}
          sub="This month"
        />
        <StatCard
          label="Expenses"
          tone="negative"
          icon={<ArrowDownIcon size={16} />}
          value={<Money amountMinor={data.monthExpense} currency={c} />}
          sub="This month"
        />
        <StatCard
          label="Net flow"
          tone={data.net >= 0 ? "positive" : "negative"}
          icon={<PieIcon size={16} />}
          value={<Money amountMinor={data.net} currency={c} signed />}
          sub={data.net >= 0 ? "You saved this month" : "Spending exceeded income"}
        />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Left column: recent + budgets */}
        <div className="space-y-6 lg:col-span-3">
          <RecentTransactions transactions={data.recent} currency={c} />
          <BudgetsPanel budgets={data.budgets} currency={c} />
        </div>

        {/* Right column: top categories + insights */}
        <div className="space-y-6 lg:col-span-2">
          <TopCategories items={data.topCategories} currency={c} />
          <InsightsList insights={data.insights} />
        </div>
      </div>
    </div>
  );
}

function RecentTransactions({
  transactions,
  currency,
}: {
  transactions: TransactionPublic[];
  currency: string;
}) {
  return (
    <Card padded={false}>
      <CardHeader
        title="Recent activity"
        action={
          <Link
            to="/transactions"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary-strong"
          >
            View all <ChevronRightIcon size={15} />
          </Link>
        }
      />
      {transactions.length === 0 ? (
        <div className="px-5 pb-5">
          <EmptyState
            title="No transactions yet"
            description="Add your first income or expense to start tracking."
          />
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {transactions.slice(0, 6).map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-5 py-3">
              <span
                className={
                  t.direction === "inflow"
                    ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-positive-soft text-positive"
                    : "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-negative-soft text-negative"
                }
              >
                {t.direction === "inflow" ? (
                  <ArrowUpIcon size={17} />
                ) : (
                  <ArrowDownIcon size={17} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-primary">
                  {t.merchant ?? TYPE_LABELS[t.type] ?? t.type}
                </p>
                <p className="text-xs text-text-muted">
                  {formatDate(t.transactionDate)}
                  {t.categoryId ? " · " + (t.note ?? "Categorised") : ""}
                </p>
              </div>
              <Money
                amountMinor={t.amountMinor}
                currency={currency}
                size="sm"
                signed={t.direction === "inflow"}
                className="whitespace-nowrap"
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function budgetTone(b: BudgetPublic): "ok" | "warning" | "over" {
  return b.alertStatus === "over" ? "over" : b.alertStatus === "warning" ? "warning" : "ok";
}

function BudgetsPanel({ budgets, currency }: { budgets: BudgetPublic[]; currency: string }) {
  if (budgets.length === 0) return null;
  return (
    <Card padded={false}>
      <CardHeader
        title="Budgets"
        action={
          <Link
            to="/budgets"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary-strong"
          >
            Manage <ChevronRightIcon size={15} />
          </Link>
        }
      />
      <ul className="space-y-4 px-5 pb-5">
        {budgets.slice(0, 4).map((b) => (
          <li key={b.id}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-medium text-text-primary">
                {b.categoryId ? "Category budget" : "Overall budget"}
              </span>
              <span className="tabular-nums text-xs text-text-muted">
                <Money amountMinor={b.spentMinor} currency={currency} size="sm" />
                <span className="mx-1 text-text-muted">/</span>
                {formatCompact(b.allocatedMinor, currency)}
              </span>
            </div>
            <ProgressBar percent={b.percent} tone={budgetTone(b)} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TopCategories({
  items,
  currency,
}: {
  items: DashboardSummary["topCategories"];
  currency: string;
}) {
  const max = items.reduce((m, i) => Math.max(m, i.totalMinor), 0) || 1;
  return (
    <Card padded={false}>
      <CardHeader title="Top categories" />
      {items.length === 0 ? (
        <div className="px-5 pb-5">
          <EmptyState title="No spending yet" description="Add expenses to see category breakdowns." />
        </div>
      ) : (
        <ul className="space-y-4 px-5 pb-5">
          {items.slice(0, 6).map((item) => (
            <li key={item.categoryId}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-medium text-text-primary">{item.name}</span>
                <span className="tabular-nums text-xs text-text-muted">
                  {formatCompact(item.totalMinor, currency)}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised">
                <div
                  className="h-full rounded-full bg-secondary"
                  style={{ width: `${(item.totalMinor / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function InsightsList({ insights }: { insights: DashboardSummary["insights"] }) {
  if (insights.length === 0) {
    return (
      <Card>
        <CardHeader title="Insights" />
        <div className="flex items-start gap-3 rounded-lg bg-info-soft/40 p-4 text-sm text-info">
          <PieIcon size={18} className="mt-0.5" />
          <p>
            Add a few transactions and we'll surface helpful patterns about your spending.
          </p>
        </div>
      </Card>
    );
  }
  return (
    <Card padded={false}>
      <CardHeader title="Insights" />
      <ul className="space-y-2 px-5 pb-5">
        {insights.map((ins) => (
          <li key={ins.id} className="rounded-lg bg-raised p-3">
            <p className="text-sm font-medium text-text-primary">{ins.title}</p>
            <p className="mt-0.5 text-xs text-text-muted">{ins.body}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

