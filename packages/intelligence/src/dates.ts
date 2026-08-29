/**
 * Small deterministic date helpers (UTC, YYYY-MM-DD / YYYY-MM). Used by the
 * engine so money facts are always bucketed consistently with the platform's
 * UTC calendar-day conventions.
 */

export function monthKeyOf(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function monthKeyFromIso(iso: string): string {
  // iso is YYYY-MM-DD or YYYY-MM
  return iso.slice(0, 7);
}

/** Number of days in the month of `year-month` (UTC). */
export function daysInMonth(yearMonth: string): number {
  const [y, m] = yearMonth.split("-").map(Number);
  if (!y || !m) return 0;
  const next = new Date(Date.UTC(y, m, 1)); // first of next month
  const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0));
  return last.getUTCDate();
}

/** Adds `n` months to a YYYY-MM key. */
export function shiftMonth(yearMonth: string, n: number): string {
  const [y, m] = yearMonth.split("-").map(Number);
  if (!y || !m) return yearMonth;
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

/** ISO YYYY-MM-DD from a Date (UTC). */
export function isoDay(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Difference in whole months between two YYYY-MM keys (b - a). */
export function monthDiff(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  if (!ay || !am || !by || !bm) return 0;
  return (by - ay) * 12 + (bm - am);
}
