import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  AnalyticsSummary,
  CashflowSeries,
  CategoryBreakdownItem,
} from "@moneytalks/types";
import { AnalyticsGranularity } from "@moneytalks/shared";
import { api } from "../lib/api/index.js";
import { useApi } from "../lib/use-api.js";
import { formatCompact, formatMonthKey, currencySymbol } from "../lib/format.js";
import { PageHeader, ErrorState, LoadingBlock } from "../components/ui/page.js";
import { Card, CardHeader } from "../components/ui/Card.js";
import { Select } from "../components/ui/forms.js";

const PALETTE = [
  "var(--mt-accent-primary)",
  "var(--mt-accent-secondary)",
  "var(--mt-positive)",
  "var(--mt-warning)",
  "var(--mt-info)",
  "#a78bfa",
  "#38bdf8",
  "#f472b6",
];

const GRANULARITY_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

export function AnalyticsPage() {
  const [granularity, setGranularity] = useState<string>(AnalyticsGranularity.Monthly);

  const summary = useApi<AnalyticsSummary>(() =>
    api.analytics.summary({ granularity: granularity as never }),
  );
  const cashflow = useApi<CashflowSeries>(() =>
    api.analytics.cashflow({ granularity: granularity as never }),
  );
  const breakdown = useApi<{ items: CategoryBreakdownItem[] }>(() =>
    api.analytics.categories({ type: "expense" }),
  );

  const series = cashflow.data?.series ?? [];
  const chartData = useMemo(
    () =>
      series.map((p) => ({
        name: formatMonthKey(p.period),
        income: p.income,
        expense: p.expense,
      })),
    [series],
  );

  if (summary.loading || cashflow.loading || breakdown.loading) {
    return <LoadingBlock label="Crunching your numbers…" />;
  }
  const error = summary.error ?? cashflow.error ?? breakdown.error;
  if (error) {
    return (
      <ErrorState
        message={error.message}
        retry={() => {
          void summary.reload();
          void cashflow.reload();
          void breakdown.reload();
        }}
      />
    );
  }

  const s = summary.data;
  const items = breakdown.data?.items ?? [];

  const totalExpense = items.reduce((m, i) => m + i.totalMinor, 0) || 1;
  const symbol = currencySymbol("INR");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Understand your patterns over time."
        actions={
          <div className="w-40">
            <Select value={granularity} onChange={(e) => setGranularity(e.target.value)}>
              {Object.entries(GRANULARITY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-4">
        <MiniStat label="Income" value={s ? formatCompact(s.income, "INR") : "—"} sign={false} />
        <MiniStat label="Expense" value={s ? formatCompact(s.expense, "INR") : "—"} sign={false} />
        <MiniStat
          label="Net"
          value={s ? formatCompact(s.cashFlow, "INR") : "—"}
          sign={Boolean(s && s.cashFlow < 0)}
        />
      </div>

      <Card padded={false}>
        <CardHeader title="Cash flow" subtitle="Income vs expenses over time" />
        <div className="h-72 px-2 pb-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="income" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--mt-positive)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--mt-positive)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="expense" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--mt-negative)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--mt-negative)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--mt-border)" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: "var(--mt-text-muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => formatCompact(v, "INR")}
                tick={{ fill: "var(--mt-text-muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <RechartsTooltip
                formatter={(value: number, name: string) => [formatCompact(value, "INR"), name]}
                contentStyle={{
                  background: "var(--mt-bg-surface-raised)",
                  border: "1px solid var(--mt-border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="income"
                name="Income"
                stroke="var(--mt-positive)"
                strokeWidth={2}
                fill="url(#income)"
              />
              <Area
                type="monotone"
                dataKey="expense"
                name="Expense"
                stroke="var(--mt-negative)"
                strokeWidth={2}
                fill="url(#expense)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card padded={false}>
          <CardHeader title="Spending by category" subtitle="All-time expense share" />
          {items.length === 0 ? (
            <div className="px-5 pb-5 text-sm text-text-muted">No expense data yet.</div>
          ) : (
            <div className="flex flex-col items-center gap-4 p-4 sm:flex-row">
              <div className="h-52 w-52 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={items}
                      dataKey="totalMinor"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {items.map((_, i) => (
                        <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      formatter={(value: number) => formatCompact(value, "INR")}
                      contentStyle={{
                        background: "var(--mt-bg-surface-raised)",
                        border: "1px solid var(--mt-border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="w-full flex-1 space-y-2">
                {items.map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: PALETTE[i % PALETTE.length] }}
                    />
                    <span className="flex-1 truncate text-text-primary">{item.name}</span>
                    <span className="tabular-nums text-xs text-text-muted">
                      {Math.round((item.totalMinor / totalExpense) * 100)}%
                    </span>
                    <span className="tabular-nums text-sm font-medium text-text-primary">
                      {formatCompact(item.totalMinor, "INR")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card padded={false}>
          <CardHeader title="Summary" subtitle="Totals in your billing currency" />
          <div className="space-y-3 p-5">
            <SummaryRow label="Total income" sign={false} value={s ? s.income : 0} symbol={symbol} />
            <SummaryRow label="Total expense" sign={false} value={s ? s.expense : 0} symbol={symbol} />
            <div className="border-t border-border pt-3">
              <SummaryRow label="Net cash flow" sign={Boolean(s && s.cashFlow < 0)} value={s ? s.cashFlow : 0} symbol={symbol} strong />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function MiniStat({ label, value, sign }: { label: string; value: string; sign: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <p className={`mt-1 font-numeric text-xl font-bold tabular-nums ${sign ? "text-negative" : "text-text-primary"}`}>
        {value}
      </p>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  symbol,
  sign,
  strong,
}: {
  label: string;
  value: number;
  symbol: string;
  sign: boolean;
  strong?: boolean;
}) {
  const abs = Math.abs(value) / 100;
  return (
    <div className={`flex items-center justify-between ${strong ? "text-base" : "text-sm"}`}>
      <span className="text-text-secondary">{label}</span>
      <span
        className={`font-numeric font-semibold tabular-nums ${
          sign ? "text-negative" : strong ? "text-positive" : "text-text-primary"
        }`}
      >
        {sign ? "−" : ""}{symbol}{abs.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    </div>
  );
}

