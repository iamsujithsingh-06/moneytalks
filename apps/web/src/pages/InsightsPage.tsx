import { useState, type FormEvent } from "react";
import type {
  AssistantTurn,
  BudgetIntelligence,
  InsightCard,
  IntelligenceReport,
  RecurringExpense,
  SpendingAnomaly,
  SpendingForecast,
} from "@moneytalks/types";
import { api } from "../lib/api/index.js";
import { useApi, useAsyncTask } from "../lib/use-api.js";
import { formatCompact, formatMonthKey, formatMoney } from "../lib/format.js";
import { PageHeader, ErrorState, LoadingBlock, Alert } from "../components/ui/page.js";
import { Card, CardHeader } from "../components/ui/Card.js";
import { Badge } from "../components/ui/Badge.js";
import { Button } from "../components/ui/Button.js";
import { Input } from "../components/ui/forms.js";
import { ProgressBar } from "../components/ui/Progress.js";
import { ArrowUpIcon } from "../components/ui/icons.js";

const TONE_BADGE: Record<string, "positive" | "warning" | "negative" | "info" | "neutral"> = {
  positive: "positive",
  warning: "warning",
  negative: "negative",
  info: "info",
};

const ALERT_BADGE: Record<string, "ok" | "warning" | "over"> = {
  ok: "ok",
  warning: "warning",
  over: "over",
};

const SEVERITY_BADGE: Record<string, "info" | "warning" | "negative"> = {
  info: "info",
  warning: "warning",
  high: "negative",
};

export function InsightsPage() {
  const report = useApi<IntelligenceReport>(() => api.intelligence.report());

  if (report.loading) return <LoadingBlock label="Analyzing your money…" />;
  if (report.error) {
    return (
      <ErrorState
        message={report.error.message}
        retry={() => void report.reload()}
      />
    );
  }
  const data = report.data!;
  const currency = data.forecast.currency || "INR";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Insights"
        description="Explainable financial intelligence from your real transactions."
      />

      <InsightCardsSection cards={data.insights} />
      <BudgetSection budgets={data.budgets} currency={currency} />
      <ForecastSection forecast={data.forecast} />
      <RecurringSection recurring={data.recurring} currency={currency} />
      <AnomaliesSection anomalies={data.anomalies} currency={currency} />
      <AssistantSection />
    </div>
  );
}

/* ----------------------------- insight cards ----------------------------- */

function InsightCardsSection({ cards }: { cards: InsightCard[] }) {
  if (cards.length === 0) {
    return (
      <Card>
        <CardHeader title="Smart insights" subtitle="What your money is telling you" />
        <p className="text-sm text-text-muted">
          Add a few confirmed transactions and we'll show you explainable insights — like
          income vs expenses, your biggest categories, and month-over-month trends.
        </p>
      </Card>
    );
  }
  return (
    <Card padded={false}>
      <CardHeader title="Smart insights" subtitle="What your money is telling you" />
      <ul className="divide-y divide-border">
        {cards.map((card) => (
          <li key={card.id} className="flex items-start gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text-primary">{card.title}</p>
              <p className="mt-0.5 text-sm text-text-muted">{card.body}</p>
            </div>
            {card.tone ? (
              <Badge tone={TONE_BADGE[card.tone] ?? "info"}>{card.tone}</Badge>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ------------------------------- budgets --------------------------------- */

function BudgetSection({ budgets, currency }: { budgets: BudgetIntelligence[]; currency: string }) {
  if (budgets.length === 0) {
    return (
      <Card>
        <CardHeader title="Budget intelligence" subtitle="Usage, warnings and projections" />
        <p className="text-sm text-text-muted">
          No active budgets yet. Create a budget to see spending status and exhaustion projections.
        </p>
      </Card>
    );
  }
  return (
    <Card padded={false}>
      <CardHeader title="Budget intelligence" subtitle="Usage, warnings and projections" />
      <ul className="divide-y divide-border">
        {budgets.map((b) => {
          const tone = ALERT_BADGE[b.alertStatus] ?? "ok";
          return (
            <li key={b.id} className="space-y-2 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-text-primary">
                  {b.categoryName ?? "Overall"}
                  <span className="ml-2 text-xs font-normal text-text-muted">
                    {b.scope} · {b.period}
                  </span>
                </p>
                <Badge tone={tone === "over" ? "negative" : tone === "warning" ? "warning" : "positive"}>
                  {b.alertStatus}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-secondary tabular-nums">
                  {formatCompact(b.spentMinor, currency)} / {formatCompact(b.allocatedMinor, currency)}
                </span>
                <span className="tabular-nums text-text-muted">{Math.round(b.percent)}%</span>
              </div>
              <ProgressBar percent={Math.min(100, b.percent)} tone={tone} />
              <p className="text-xs text-text-muted">{b.message}</p>
              {b.projectionBasis ? (
                <div className="rounded-md bg-raised px-3 py-2 text-xs text-text-muted">
                  <span className="font-medium text-text-secondary">Projection: </span>
                  {b.onTrack ? "On track. " : "Likely to exceed. "}
                  {b.projectedSpentMinor != null
                    ? `Projected ${formatCompact(b.projectedSpentMinor, currency)}. `
                    : ""}
                  {b.daysToExhaustion != null
                    ? `${b.daysToExhaustion} day(s) to budget exhaustion. `
                    : ""}
                  {b.projectionBasis}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ------------------------------- forecast -------------------------------- */

function ForecastSection({ forecast }: { forecast: SpendingForecast }) {
  if (forecast.insufficientData) {
    return (
      <Card>
        <CardHeader title="Spending forecast" subtitle="Estimated future spend" />
        <Alert tone="info">{forecast.basis}</Alert>
      </Card>
    );
  }
  return (
    <Card padded={false}>
      <CardHeader
        title="Spending forecast"
        subtitle={`Estimated future spend · ${forecast.confidence} confidence`}
        action={<Badge tone="info">Estimate</Badge>}
      />
      <div className="px-5 pb-4">
        <p className="mb-3 text-xs text-text-muted">{forecast.basis}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {forecast.points.map((p) => (
            <div key={p.period} className="rounded-md border border-border bg-raised p-3">
              <p className="text-xs text-text-muted">{formatMonthKey(p.period)}</p>
              <p className="mt-1 font-numeric text-lg font-bold tabular-nums text-text-primary">
                {formatCompact(p.projectedExpenseMinor, forecast.currency)}
              </p>
              <p className="text-[11px] text-text-muted tabular-nums">
                range {formatCompact(p.lowerMinor, forecast.currency)}–
                {formatCompact(p.upperMinor, forecast.currency)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------- recurring ------------------------------- */

function RecurringSection({ recurring, currency }: { recurring: RecurringExpense[]; currency: string }) {
  if (recurring.length === 0) {
    return (
      <Card>
        <CardHeader title="Recurring expenses" subtitle="Likely subscriptions and bills" />
        <p className="text-sm text-text-muted">
          No recurring patterns detected yet. Repeated purchases with a regular merchant will show up here.
        </p>
      </Card>
    );
  }
  return (
    <Card padded={false}>
      <CardHeader title="Recurring expenses" subtitle="Likely subscriptions and bills" />
      <ul className="divide-y divide-border">
        {recurring.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">{r.merchant}</p>
              <p className="text-xs text-text-muted">
                {r.frequency} · {r.occurrences} occurrence(s) · {r.explanation}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="font-numeric text-sm font-semibold tabular-nums text-text-primary">
                {formatMoney(r.typicalAmountMinor, currency)}
              </span>
              <Badge tone={r.confidence > 0.7 ? "positive" : "info"}>
                {Math.round(r.confidence * 100)}%
              </Badge>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ------------------------------- anomalies ------------------------------- */

function AnomaliesSection({ anomalies, currency }: { anomalies: SpendingAnomaly[]; currency: string }) {
  if (anomalies.length === 0) {
    return (
      <Card>
        <CardHeader title="Anomalies" subtitle="Unusual spending checked against your history" />
        <p className="text-sm text-text-muted">
          No anomalies detected. Unusually large or out-of-place expenses will be flagged with a reason.
        </p>
      </Card>
    );
  }
  return (
    <Card padded={false}>
      <CardHeader title="Anomalies" subtitle="Unusual spending checked against your history" />
      <ul className="divide-y divide-border">
        {anomalies.map((a) => (
          <li key={a.id} className="flex items-start justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">{a.merchant ?? a.categoryName ?? "Expense"}</p>
              <p className="mt-0.5 text-xs text-text-muted">{a.reason}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="font-numeric text-sm font-semibold tabular-nums text-text-primary">
                {formatMoney(a.amountMinor, currency)}
              </span>
              <Badge tone={SEVERITY_BADGE[a.severity] ?? "info"}>{a.severity}</Badge>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ------------------------------- assistant ------------------------------- */

function AssistantSection() {
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [question, setQuestion] = useState("");

  const submit = useAsyncTask(async (q: string) => {
    const turn = await api.intelligence.assistant(q);
    setTurns((prev) => [...prev, { ...turn, question: q }]);
    setQuestion("");
  });

  const busy = submit.loading;

  function onForm(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || busy) return;
    void submit.run(q);
  }

  return (
    <Card>
      <CardHeader
        title="Ask about your money"
        subtitle="Answers come only from your real transactions. Try: “How much did I spend total?”"
      />
      <div className="mb-4 max-h-80 space-y-2 overflow-y-auto">
        {turns.length === 0 ? (
          <p className="text-sm text-text-muted">
            Ask about total spend, your biggest categories, budget status, month-over-month
            comparisons, or trends.
          </p>
        ) : (
          turns.map((turn, i) => {
            const isFallback = !turn.supported || typeof turn.fallbackMessage === "string";
            return (
              <div key={i} className="space-y-1.5">
                <div className="flex justify-end">
                  <span className="max-w-[80%] rounded-lg rounded-br-none bg-primary px-3 py-2 text-sm text-white">
                    {turn.question}
                  </span>
                </div>
                <div className="flex justify-start">
                  <div className="max-w-[85%] space-y-0.5">
                    <span className="block rounded-lg rounded-bl-none border border-border bg-raised px-3 py-2 text-sm text-text-primary">
                      {turn.answer}
                    </span>
                    {isFallback && turn.caveat ? (
                      <p className="px-1 text-xs text-text-muted">{turn.caveat}</p>
                    ) : null}
                    {turn.caveat && !isFallback ? (
                      <p className="px-1 text-xs text-text-muted">({turn.caveat})</p>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      <form onSubmit={onForm} className="flex items-center gap-2">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about your spending…"
          disabled={busy}
          aria-label="Ask about your money"
        />
        <Button type="submit" disabled={question.trim().length === 0 || busy} loading={busy}>
          <ArrowUpIcon />
        </Button>
      </form>
    </Card>
  );
}
