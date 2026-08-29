import type { RecurringExpense } from "@moneytalks/types";
import type { IntelligenceContext } from "./types.js";

/** Minimum occurrences on roughly-regular cadence to call something recurring. */
const MIN_OCCURRENCES = 2;
/** Max gap (in days) tolerated between consecutive occurrences of a monthly
 * recurring merchant (e.g. 14–47 days around a ~30 day cycle). */
const MONTHLY_TOLERANCE = 17;
/** Similar for weekly (~7 day cycle, tolerate 4–10 days). */
const WEEKLY_TOLERANCE_LOW = 4;
const WEEKLY_TOLERANCE_HIGH = 10;
/** Amount drift tolerance: a recurring amount should stay within ±30%. */
const AMOUNT_TOLERANCE = 0.3;

function dayNum(iso: string): number {
  return new Date(`${iso}T00:00:00.000Z`).getTime() / 86_400_000;
}

function gapDays(a: string, b: string): number {
  return Math.abs(dayNum(b) - dayNum(a));
}

/**
 * Detect likely recurring expenses from existing expense transaction history.
 * A candidate is a merchant with repeated transactions whose intervals and
 * amounts are consistent. Confidence and evidence are always returned so the
 * caller (and any AI layer) explains without guessing.
 */
export function detectRecurringExpenses(
  ctx: IntelligenceContext,
): RecurringExpense[] {
  const expenses = ctx.transactions
    .filter((t) => t.isExpense && t.merchant)
    .sort((a, b) => a.date.localeCompare(b.date));

  const byMerchant = new Map<string, Array<{ date: string; amountMinor: number }>>();
  for (const t of expenses) {
    const merchant = t.merchant as string;
    const arr = byMerchant.get(merchant) ?? [];
    arr.push({ date: t.date, amountMinor: t.amountMinor });
    byMerchant.set(merchant, arr);
  }

  const results: RecurringExpense[] = [];
  for (const [merchant, items] of byMerchant) {
    if (items.length < MIN_OCCURRENCES) continue;

    const detection = analyzeSeries(items, merchant);
    if (!detection) continue;

    results.push({
      id: `recurring:${merchant}`,
      merchant,
      categoryId: ctx.categories.find(
        (c) => c.name.toLowerCase() === merchant.toLowerCase(),
      )?.id ?? null,
      frequency: detection.frequency,
      typicalAmountMinor: detection.typicalAmount,
      occurrences: items.length,
      confidence: detection.confidence,
      evidence: items.map((i) => ({ date: i.date, amountMinor: i.amountMinor })),
      explanation: detection.explanation,
    });
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}

function analyzeSeries(
  items: Array<{ date: string; amountMinor: number }>,
  merchant: string,
): {
  frequency: RecurringExpense["frequency"];
  typicalAmount: number;
  confidence: number;
  explanation: string;
} | null {
  const gaps: number[] = [];
  for (let i = 1; i < items.length; i++) {
    gaps.push(gapDays(items[i - 1]!.date, items[i]!.date));
  }

  // Determine dominant cadence from observed gaps.
  let frequency: RecurringExpense["frequency"];
  let consistent = true;
  for (const g of gaps) {
    const weeklyOk = g >= WEEKLY_TOLERANCE_LOW && g <= WEEKLY_TOLERANCE_HIGH;
    const monthlyOk = g >= 30 - MONTHLY_TOLERANCE && g <= 30 + MONTHLY_TOLERANCE;
    if (!weeklyOk && !monthlyOk) {
      consistent = false;
      break;
    }
  }
  if (!consistent) return null;

  if (gaps.every((g) => g <= WEEKLY_TOLERANCE_HIGH)) {
    frequency = "weekly";
  } else {
    frequency = "monthly";
  }

  // Amount consistency within ±tolerance of the mean.
  const typicalAmount =
    Math.round(items.reduce((m, i) => m + i.amountMinor, 0) / items.length);
  if (typicalAmount <= 0) return null;
  for (const i of items) {
    const ratio = i.amountMinor / typicalAmount;
    if (ratio < 1 - AMOUNT_TOLERANCE || ratio > 1 + AMOUNT_TOLERANCE) {
      return null;
    }
  }

  // Confidence rises with regularity and occurrence count.
  const occurrenceBonus = Math.min(0.2, (items.length - MIN_OCCURRENCES) * 0.05);
  const cadenceConfidence = frequency === "weekly" ? 0.6 : 0.7;
  const confidence = Math.min(0.95, cadenceConfidence + occurrenceBonus);

  const explanation =
    `${merchant} appeared ${items.length} times at ~${typicalAmount} minor units on a roughly ${frequency} cadence.`;

  return { frequency, typicalAmount, confidence, explanation };
}
