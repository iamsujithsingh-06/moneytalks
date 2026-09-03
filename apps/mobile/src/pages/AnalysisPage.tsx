import { useMemo, useState } from "react";
import { useLedger } from "../state/ledger-context.js";
import { Money } from "../components/ui/Money.js";
import { Badge } from "../components/ui/Badge.js";
import { PageLoader, ErrorCard } from "../components/ui/feedback.js";
import { EmptyState } from "../components/ui/EmptyState.js";
import { BarChartIcon } from "../components/ui/icons.js";
import {
  computeAnalysis,
  type AnalysisData,
  type AnalysisPeriod,
  type TrendPoint,
} from "../lib/analysis.js";
import { formatAmount, formatDate } from "../lib/format.js";
import type { ReactNode } from "react";

function PercentageDelta({
  current,
  prev,
  invert = false,
}: {
  current: number;
  prev: number;
  invert?: boolean;
}) {
  if (prev === 0) return null;
  const pct = Math.round(((current - prev) / prev) * 100);
  const up = invert ? pct < 0 : pct > 0;
  return (
    <Badge tone={pct === 0 ? "neutral" : up ? "positive" : "negative"}>
      {pct > 0 ? "▲" : "▼"} {Math.abs(pct)}% vs prev
    </Badge>
  );
}

function TrendChart({ trend }: { trend: TrendPoint[] }) {
  const max = Math.max(1, ...trend.map((t) => t.expense));
  return (
    <div>
      <div className="flex items-end gap-1.5" role="img" aria-label="Spending trend bar chart">
        {trend.map((point) => {
          const height = point.expense > 0 ? (point.expense / max) * 100 : 2;
          return (
            <div
              key={point.key}
              className="group relative flex h-32 flex-1 flex-col items-center justify-end"
            >
              <span className="pointer-events-none absolute -top-10 z-10 hidden whitespace-nowrap rounded-md border border-border bg-surface px-2 py-1 text-xs text-text-primary shadow-lg group-hover:block">
                {point.label}: {formatAmount(point.expense, "INR")}
              </span>
              <div
                className={`w-full rounded-t-md transition-all ${
                  point.expense > 0 ? "bg-primary" : "bg-border"
                }`}
                style={{ height: `${Math.max(height, 2)}%` }}
              />
              <span className="mt-1.5 text-[10px] text-text-muted">{point.label}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex justify-between rounded-lg bg-raised px-3 py-2 text-xs text-text-muted">
        <span>{formatDate(trend[0]?.key ?? "")}</span>
        <span>{formatDate(trend[trend.length - 1]?.key ?? "")}</span>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  amountMinor,
  tone,
  sub,
}: {
  label: string;
  amountMinor: number;
  tone?: "positive" | "negative" | "inherit";
  sub?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <Money
        amountMinor={amountMinor}
        currency="INR"
        signed={tone === "positive" || tone === "negative"}
        tone={tone}
        className="mt-1"
      />
      {sub ? <div className="mt-2">{sub}</div> : null}
    </div>
  );
}

export function AnalysisPage() {
  const { transactions, data, loading, refresh } = useLedger();
  const [period, setPeriod] = useState<AnalysisPeriod>("monthly");
  const now = useMemo(() => new Date(), []);

  const analysis: AnalysisData | null = useMemo(() => {
    if (!data) return null;
    return computeAnalysis(transactions, period, now);
  }, [transactions, period, now, data]);

  if (loading && !data) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 pb-8">
        <PageLoader label="Crunching your numbers…" />
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 pb-8">
        <ErrorCard message="Could not load your analysis." onRetry={() => void refresh()} />
      </div>
    );
  }

  const isEmpty = analysis.income === 0 && analysis.expense === 0;

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-8">
      <header className="flex items-center justify-between pb-4 pt-2">
        <div className="flex items-center gap-2">
          <BarChartIcon size={20} className="text-primary" />
          <h1 className="text-2xl font-bold text-text-primary">Analysis</h1>
        </div>
        <div className="flex rounded-lg border border-border bg-surface p-0.5" role="tablist" aria-label="Analysis period">
          {(["weekly", "monthly"] as AnalysisPeriod[]).map((p) => (
            <button
              key={p}
              role="tab"
              aria-selected={period === p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                period === p
                  ? "bg-primary text-[#0b0b12]"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </header>

      {!analysis.income && !analysis.expense ? (
        <EmptyState
          icon={<BarChartIcon size={26} />}
          title={`No transactions this ${period}`}
          description="Add transactions or capture a bank SMS to see spending analysis."
        />
      ) : null}

      <div className="space-y-6">
        <section className="grid grid-cols-2 gap-3">
          <MetricCard
            label="Income"
            amountMinor={analysis.income}
            tone="positive"
            sub={<PercentageDelta current={analysis.income} prev={analysis.prev.income} />}
          />
          <MetricCard
            label="Expenses"
            amountMinor={analysis.expense}
            tone="negative"
            sub={<PercentageDelta current={analysis.expense} prev={analysis.prev.expense} invert />}
          />
          <MetricCard
            label="Net savings"
            amountMinor={analysis.netSavings}
            tone={analysis.netSavings >= 0 ? "positive" : "negative"}
            sub={<PercentageDelta current={analysis.netSavings} prev={analysis.prev.netSavings} />}
          />
          <MetricCard
            label="Avg daily spend"
            amountMinor={analysis.avgDailySpend}
            sub={
              <PercentageDelta
                current={analysis.avgDailySpend}
                prev={analysis.prev.avgDailySpend}
                invert
              />
            }
          />
        </section>

        {!isEmpty ? (
          <>
            <section className="rounded-xl border border-border bg-surface p-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text-secondary">Spending trend</h2>
                <span className="text-xs text-text-muted">
                  {analysis.trend.filter((t) => t.expense > 0).length} active day
                  {analysis.trend.filter((t) => t.expense > 0).length === 1 ? "" : "s"}
                </span>
              </div>
              <TrendChart trend={analysis.trend} />
            </section>

            {analysis.highestDay ? (
              <section className="rounded-xl border border-border bg-surface p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-text-secondary">Highest spending day</h2>
                  <Badge tone="negative">Peak</Badge>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {formatDate(analysis.highestDay.key)}
                    </p>
                    <p className="text-xs text-text-muted">{analysis.highestDay.label}</p>
                  </div>
                  <Money amountMinor={analysis.highestDay.expense} currency="INR" tone="negative" />
                </div>
              </section>
            ) : null}

            <section className="rounded-xl border border-border bg-surface p-4">
              <h2 className="text-sm font-semibold text-text-secondary">Top categories</h2>
              {analysis.topCategories.length === 0 ? (
                <p className="mt-3 text-sm text-text-muted">No categorized spending this {period}.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {analysis.topCategories.map((cat, i) => (
                    <li key={cat.name} className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-raised text-xs font-bold text-text-secondary">
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-text-primary">{cat.name}</p>
                          <p className="text-xs text-text-muted">
                            {cat.count} transaction{cat.count > 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                      <Money amountMinor={cat.totalMinor} currency="INR" tone="negative" size="sm" />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-border bg-surface p-4">
              <h2 className="text-sm font-semibold text-text-secondary">Category breakdown</h2>
              {analysis.categories.length === 0 ? (
                <p className="mt-3 text-sm text-text-muted">No category spending this {period}.</p>
              ) : (
                <div className="mt-3 space-y-2.5">
                  {analysis.categories.map((cat) => {
                    const pct = analysis.expense > 0 ? (cat.totalMinor / analysis.expense) * 100 : 0;
                    return (
                      <div key={cat.name}>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-sm text-text-primary">{cat.name}</span>
                          <Money amountMinor={cat.totalMinor} currency="INR" size="sm" tone="negative" />
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-raised">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text-secondary">Previous {period} comparison</h2>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-text-muted">Income</p>
                  <Money amountMinor={analysis.prev.income} currency="INR" size="sm" tone="positive" />
                </div>
                <div>
                  <p className="text-xs text-text-muted">Expenses</p>
                  <Money amountMinor={analysis.prev.expense} currency="INR" size="sm" tone="negative" />
                </div>
                <div>
                  <p className="text-xs text-text-muted">Net</p>
                  <Money amountMinor={analysis.prev.netSavings} currency="INR" size="sm" tone={analysis.prev.netSavings >= 0 ? "positive" : "negative"} />
                </div>
              </div>
            </section>
          </>
        ) : null}

        {!isEmpty && analysis.insights.length > 0 ? (
          <section aria-label="Insights" className="space-y-3">
            {analysis.insights.map((insight) => (
              <div
                key={insight.id}
                className="rounded-xl border border-border bg-surface p-4"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      insight.tone === "positive"
                        ? "bg-positive"
                        : insight.tone === "warning"
                          ? "bg-warning"
                          : insight.tone === "negative"
                            ? "bg-negative"
                            : "bg-info"
                    }`}
                  />
                  <h3 className="text-sm font-semibold text-text-primary">{insight.title}</h3>
                </div>
                <p className="mt-2 text-sm text-text-muted">{insight.body}</p>
              </div>
            ))}
          </section>
        ) : null}
      </div>
    </div>
  );
}
