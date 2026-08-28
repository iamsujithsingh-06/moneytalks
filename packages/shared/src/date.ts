const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Strictly validates an ISO 8601 calendar day (`YYYY-MM-DD`), rejecting
 * out-of-range rollovers that JavaScript's `Date.parse` silently accepts
 * (e.g. `2026-02-30` becomes `2026-03-02` in V8).
 */
export function isValidCalendarDay(value: string): boolean {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1] ?? NaN);
  const month = Number(match[2] ?? NaN);
  const day = Number(match[3] ?? NaN);
  if (year < 100 || year > 9999) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
