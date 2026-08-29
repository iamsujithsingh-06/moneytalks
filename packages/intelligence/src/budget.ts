import type { BudgetIntelligence } from "@moneytalks/types";
import {
  BudgetAlertStatus,
  calculateBudgetPercent,
  deriveBudgetAlertStatus,
} from "@moneytalks/shared";
import { isoDay } from "./dates.js";
import type { IntelligenceContext, IntelligenceTransaction } from "./types.js";

/** Minimum average daily spend required to project budget exhaustion. */
const MIN_DAILY_SPEND = 1;

/**
 * Deterministic budget intelligence: usage, remaining, overspending warnings
 * and an explainable projection to exhaustion when history supports it.
 *
 * Spend is computed from the user's confirmed expense transactions that fall
 * inside each budget's inclusive period window — the same real MoneyTalks
 * data the budgets module uses. Nothing is invented.
 */
export function buildBudgetIntelligence(
  ctx: IntelligenceContext,
): BudgetIntelligence[] {
  const budgets = ctx.budgets
    .map((b) => {
      const spent = spentInWindow(ctx.transactions, b.window);
      const percent = calculateBudgetPercent(b.allocatedMinor, spent);
      const alertStatus = deriveBudgetAlertStatus(percent, {
        warningPct: 80,
        hardPct: 100,
      });
      const remainingMinor = Math.max(0, b.allocatedMinor - spent);
      const overspentMinor = Math.max(0, spent - b.allocatedMinor);

      const projection = projectExhaustion(ctx, b, spent);
      const message = buildMessage(alertStatus, spent, remainingMinor, overspentMinor);

      return {
        id: b.id,
        categoryId: b.categoryId,
        categoryName: b.categoryName,
        scope: b.scope,
        period: b.period,
        allocatedMinor: b.allocatedMinor,
        spentMinor: spent,
        percent,
        alertStatus,
        remainingMinor,
        overspentMinor,
        message,
        ...projection,
      };
    })
    .sort((a, b) => b.percent - a.percent);

  return budgets;
}

function spentInWindow(
  transactions: IntelligenceTransaction[],
  window: { from: Date; to: Date },
): number {
  const fromIso = isoDay(window.from);
  const toIso = isoDay(window.to);
  let total = 0;
  for (const t of transactions) {
    if (!t.isExpense) continue;
    if (t.date < fromIso || t.date > toIso) continue;
    total += t.amountMinor;
  }
  return total;
}

function projectExhaustion(
  ctx: IntelligenceContext,
  budget: IntelligenceContext["budgets"][number],
  spent: number,
): Pick<
  BudgetIntelligence,
  "projectedSpentMinor" | "daysToExhaustion" | "onTrack" | "projectionBasis"
> {
  const { from, to } = budget.window;
  const now = new Date(`${ctx.now}T00:00:00.000Z`);
  const fromIso = isoDay(from);
  const toIso = isoDay(to);
  const nowIso = isoDay(now);

  if (nowIso < fromIso || nowIso > toIso) {
    return { projectedSpentMinor: null, daysToExhaustion: null, onTrack: null, projectionBasis: null };
  }

  const elapsedDays = daysBetween(fromIso, nowIso);
  const totalDays = daysBetween(fromIso, toIso);
  const remainingDays = Math.max(0, totalDays - elapsedDays);

  if (elapsedDays <= 0 || totalDays <= 0) {
    return { projectedSpentMinor: null, daysToExhaustion: null, onTrack: null, projectionBasis: null };
  }

  const avgDaily = spent / elapsedDays;
  if (avgDaily < MIN_DAILY_SPEND) {
    return { projectedSpentMinor: null, daysToExhaustion: null, onTrack: null, projectionBasis: null };
  }

  const projectedSpentMinor = Math.round(avgDaily * totalDays);
  const projectedPercent = calculateBudgetPercent(budget.allocatedMinor, projectedSpentMinor);
  const onTrack = projectedPercent <= 100;

  const remainingMinor = Math.max(0, budget.allocatedMinor - spent);
  let daysToExhaustion: number | null = null;
  if (remainingMinor > 0 && avgDaily > 0) {
    daysToExhaustion = Math.floor(remainingMinor / avgDaily);
    // Cap at the remaining days in period; if it exceeds the period it never exhausts.
    daysToExhaustion = Math.min(daysToExhaustion, remainingDays);
  }

  return {
    projectedSpentMinor,
    daysToExhaustion,
    onTrack,
    projectionBasis: `Projected from the average of ${spent} spent across ${elapsedDays} day(s), extended to the ${totalDays}-day period.`,
  };
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T00:00:00.000Z`).getTime();
  const b = new Date(`${toIso}T00:00:00.000Z`).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000) + 1);
}

function buildMessage(
  alertStatus: string,
  spentMinor: number,
  remainingMinor: number,
  overspentMinor: number,
): string {
  if (alertStatus === BudgetAlertStatus.Over) {
    return `Over budget by ${overspentMinor} minor units (spent ${spentMinor}).`;
  }
  if (alertStatus === BudgetAlertStatus.Warning) {
    return `Approaching your budget limit — ${remainingMinor} minor units remaining.`;
  }
  return `${remainingMinor} minor units remaining this period.`;
}
