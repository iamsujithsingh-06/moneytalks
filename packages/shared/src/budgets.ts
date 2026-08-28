import type { BudgetPeriod } from "./enums.js";
import { BudgetAlertStatus } from "./enums.js";

/**
 * Alert thresholds for a budget, as whole percentages on the 0–100 scale
 * (e.g., `warningPct: 80` means 80%). Comparisons are inclusive:
 * `percent >= hardPct` is "over"; `warningPct <= percent < hardPct` is
 * "warning"; below `warningPct` is "ok" (see `deriveBudgetAlertStatus`).
 * Mirrors DATABASE_ARCHITECTURE §3.5 `alertThresholds` and the budget alert
 * semantics in USER_FLOWS flow 11 (`ok|warning|over`).
 */
export interface BudgetAlertThresholds {
  warningPct: number;
  hardPct: number;
}

/**
 * Computes the percentage of a budget's allocation that has been spent:
 * `(spentMinor / allocatedMinor) * 100`. Amounts are integer minor units
 * (no floats). Returns `0` when the allocation is missing/zero/negative or
 * non-integer so the result is always a finite number for valid integer
 * minor-unit inputs (never NaN/Infinity). May exceed 100 when over budget.
 */
export function calculateBudgetPercent(
  allocatedMinor: number,
  spentMinor: number,
): number {
  if (!Number.isSafeInteger(allocatedMinor) || allocatedMinor <= 0) return 0;
  return (spentMinor / allocatedMinor) * 100;
}

/**
 * Derives the budget alert status from a spend percentage and thresholds:
 * - `percent < warningPct` → `ok`
 * - `warningPct <= percent < hardPct` → `warning`
 * - `percent >= hardPct` → `over`
 */
export function deriveBudgetAlertStatus(
  percent: number,
  thresholds: BudgetAlertThresholds,
): BudgetAlertStatus {
  if (percent < thresholds.warningPct) return BudgetAlertStatus.Ok;
  if (percent < thresholds.hardPct) return BudgetAlertStatus.Warning;
  return BudgetAlertStatus.Over;
}

/** Inclusive UTC `[from, to]` window for a budget period (see `resolveBudgetPeriodWindow`). */
export interface BudgetPeriodWindow {
  from: Date;
  to: Date;
}

function startOfDayUtc(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function endOfDayUtc(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}

function mondayOfWeekUtc(date: Date): Date {
  const day = startOfDayUtc(date);
  const weekday = day.getUTCDay();
  const back = weekday === 0 ? 6 : weekday - 1;
  return new Date(
    Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() - back),
  );
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/**
 * Resolves the inclusive UTC `[from, to]` window used for spend aggregation
 * for a budget, following standard calendar rules:
 * - `weekly` — Monday through Sunday of the week containing `now` (ISO).
 * - `monthly` — the calendar month containing `now`.
 * - `yearly` — the calendar year containing `now`.
 * - `custom` — from `periodAnchor` (the documented custom start) through the
 *   end of `now`'s day; the architecture defines no custom end date, so the
 *   window runs from the anchor onward.
 *
 * All boundaries are computed in UTC to match the platform's existing date
 * conventions (transactions are stored as UTC instants and list filters are
 * UTC calendar-day ranges). A missing/invalid anchor on a custom budget falls
 * back to the current month-to-date window.
 */
export function resolveBudgetPeriodWindow(
  period: BudgetPeriod,
  periodAnchor: Date | string | null | undefined,
  now: Date = new Date(),
): BudgetPeriodWindow {
  switch (period) {
    case "weekly": {
      const start = mondayOfWeekUtc(now);
      const end = new Date(
        Date.UTC(
          start.getUTCFullYear(),
          start.getUTCMonth(),
          start.getUTCDate() + 6,
          23,
          59,
          59,
          999,
        ),
      );
      return { from: start, to: end };
    }
    case "yearly": {
      const from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      const to = new Date(
        Date.UTC(now.getUTCFullYear(), 11, 31, 23, 59, 59, 999),
      );
      return { from, to };
    }
    case "custom": {
      const anchor = asDate(periodAnchor);
      if (anchor) {
        return { from: startOfDayUtc(anchor), to: endOfDayUtc(now) };
      }
      return {
        from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
        to: endOfDayUtc(now),
      };
    }
    case "monthly":
    default: {
      const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const to = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999),
      );
      return { from, to };
    }
  }
}
