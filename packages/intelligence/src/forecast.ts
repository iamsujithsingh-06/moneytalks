import type { ForecastConfidence, SpendingForecast } from "@moneytalks/types";
import { shiftMonth, daysInMonth } from "./dates.js";
import type { IntelligenceContext } from "./types.js";

/** How many prior months of history are needed for a high-confidence forecast. */
const HIGH_CONFIDENCE_MONTHS = 3;
const MEDIUM_CONFIDENCE_MONTHS = 1;
/** Number of future months projected. */
const HORIZON_MONTHS = 3;
/** Minimum distinct months for any projection. */
const MIN_MONTHS = 1;

/**
 * Explainable spending forecast. The future is estimated from the user's
 * real historical monthly expense totals using a simple moving average —
 * never fabricated. Output is always labelled an estimate, and when there is
 * insufficient history the engine says so instead of guessing.
 */
export function buildForecast(ctx: IntelligenceContext): SpendingForecast {
  const expenses = ctx.transactions.filter((t) => t.isExpense);

  const byMonth = new Map<string, number>();
  for (const t of expenses) {
    byMonth.set(t.month, (byMonth.get(t.month) ?? 0) + t.amountMinor);
  }
  const months = [...byMonth.keys()].sort();

  const confidence = deriveConfidence(months.length);

  if (months.length < MIN_MONTHS) {
    return {
      currency: ctx.currency,
      granularity: "monthly",
      confidence: "none",
      isEstimate: true,
      points: [],
      basis:
        "Not enough transaction history to make a forecast. Add more confirmed expenses and check back.",
      insufficientData: true,
    };
  }

  const avg =
    months.reduce((m, k) => m + (byMonth.get(k) ?? 0), 0) / months.length;
  // Simple volatility: standard deviation of monthly totals.
  const variance = months.reduce((m, k) => {
    const d = (byMonth.get(k) ?? 0) - avg;
    return m + d * d;
  }, 0);
  const stdDev = Math.sqrt(variance / months.length);

  const lastMonth = months[months.length - 1] as string;
  const points = [];
  for (let i = 1; i <= HORIZON_MONTHS; i++) {
    const period = shiftMonth(lastMonth, i);
    const projectedExpenseMinor = Math.max(0, Math.round(avg));
    const spread = confidence === "high" ? stdDev : stdDev * 1.5;
    const lowerMinor = Math.max(0, Math.round(projectedExpenseMinor - spread));
    const upperMinor = Math.max(0, Math.round(projectedExpenseMinor + spread));
    points.push({ period, projectedExpenseMinor, lowerMinor, upperMinor });
  }

  // Scale an average daily spend estimate when we have a partial current month
  // (so the first projected bucket reflects real month-to-date spend).
  const nowMonth = ctx.now.slice(0, 7);
  const mtd = byMonth.get(nowMonth) ?? 0;
  const monthDays = daysInMonth(nowMonth);
  const currentDay = Number(ctx.now.slice(8, 10)) || 1;
  if (mtd > 0 && currentDay > 0 && currentDay < monthDays) {
    const dailyAvg = mtd / currentDay;
    const full = Math.round(dailyAvg * monthDays);
    if (points[0]) {
      points[0] = {
        ...points[0],
        projectedExpenseMinor: full,
        lowerMinor: Math.max(0, Math.round(full - stdDev)),
        upperMinor: Math.max(0, Math.round(full + stdDev)),
      };
    }
  }

  return {
    currency: ctx.currency,
    granularity: "monthly",
    confidence,
    isEstimate: true,
    points,
    basis: `Projected from the average of ${months.length} month(s) of real expenses (${months.join(", ")}), using a moving average${confidence === "high" ? " with a volatility band" : ""}.`,
    insufficientData: false,
  };
}

function deriveConfidence(monthCount: number): ForecastConfidence {
  if (monthCount >= HIGH_CONFIDENCE_MONTHS) return "high";
  if (monthCount >= MEDIUM_CONFIDENCE_MONTHS) return "medium";
  return "low";
}
