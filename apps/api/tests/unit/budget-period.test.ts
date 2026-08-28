import { describe, expect, it } from "vitest";
import {
  BudgetPeriod,
  resolveBudgetPeriodWindow,
} from "@moneytalks/shared";

function iso(date: Date): string {
  return date.toISOString();
}

describe("resolveBudgetPeriodWindow", () => {
  const now = new Date("2026-08-09T14:30:00.000Z"); // Sunday 2026-08-09

  it("resolves the current month in UTC", () => {
    const window = resolveBudgetPeriodWindow(BudgetPeriod.Monthly, null, now);
    expect(iso(window.from)).toBe("2026-08-01T00:00:00.000Z");
    expect(iso(window.to)).toBe("2026-08-31T23:59:59.999Z");
  });

  it("resolves the month for December/January boundaries", () => {
    const dec = resolveBudgetPeriodWindow(
      BudgetPeriod.Monthly,
      null,
      new Date("2026-12-15T00:00:00.000Z"),
    );
    expect(iso(dec.from)).toBe("2026-12-01T00:00:00.000Z");
    expect(iso(dec.to)).toBe("2026-12-31T23:59:59.999Z");
    const jan = resolveBudgetPeriodWindow(
      BudgetPeriod.Monthly,
      null,
      new Date("2027-01-01T00:00:00.000Z"),
    );
    expect(iso(jan.from)).toBe("2027-01-01T00:00:00.000Z");
    expect(iso(jan.to)).toBe("2027-01-31T23:59:59.999Z");
  });

  it("resolves leap February boundaries", () => {
    const leap = resolveBudgetPeriodWindow(
      BudgetPeriod.Monthly,
      null,
      new Date("2024-02-10T00:00:00.000Z"),
    );
    expect(iso(leap.to)).toBe("2024-02-29T23:59:59.999Z");
  });

  it("resolves the current year in UTC", () => {
    const window = resolveBudgetPeriodWindow(BudgetPeriod.Yearly, null, now);
    expect(iso(window.from)).toBe("2026-01-01T00:00:00.000Z");
    expect(iso(window.to)).toBe("2026-12-31T23:59:59.999Z");
  });

  it("resolves the Monday-Sunday week containing the reference day", () => {
    const sunday = resolveBudgetPeriodWindow(BudgetPeriod.Weekly, null, now);
    expect(iso(sunday.from)).toBe("2026-08-03T00:00:00.000Z");
    expect(iso(sunday.to)).toBe("2026-08-09T23:59:59.999Z");

    const monday = resolveBudgetPeriodWindow(
      BudgetPeriod.Weekly,
      null,
      new Date("2026-08-03T08:00:00.000Z"),
    );
    expect(iso(monday.from)).toBe("2026-08-03T00:00:00.000Z");
    expect(iso(monday.to)).toBe("2026-08-09T23:59:59.999Z");

    const wednesday = resolveBudgetPeriodWindow(
      BudgetPeriod.Weekly,
      null,
      new Date("2026-08-05T12:00:00.000Z"),
    );
    expect(iso(wednesday.from)).toBe("2026-08-03T00:00:00.000Z");
    expect(iso(wednesday.to)).toBe("2026-08-09T23:59:59.999Z");
  });

  it("treats Sunday as the end of the week (ISO Monday start)", () => {
    const window = resolveBudgetPeriodWindow(
      BudgetPeriod.Weekly,
      null,
      new Date("2026-08-09T00:00:00.000Z"),
    );
    expect(iso(window.from)).toBe("2026-08-03T00:00:00.000Z");
  });

  it("resolves custom from the anchor through the end of the reference day", () => {
    const window = resolveBudgetPeriodWindow(
      BudgetPeriod.Custom,
      "2026-03-01",
      now,
    );
    expect(iso(window.from)).toBe("2026-03-01T00:00:00.000Z");
    expect(iso(window.to)).toBe("2026-08-09T23:59:59.999Z");
  });

  it("accepts a Date periodAnchor", () => {
    const window = resolveBudgetPeriodWindow(
      BudgetPeriod.Custom,
      new Date("2026-03-01T00:00:00.000Z"),
      now,
    );
    expect(iso(window.from)).toBe("2026-03-01T00:00:00.000Z");
  });

  it("falls back to month-to-date when a custom anchor is missing or invalid", () => {
    for (const anchor of [null, undefined, "not-a-date"]) {
      const window = resolveBudgetPeriodWindow(
        BudgetPeriod.Custom,
        anchor,
        now,
      );
      expect(iso(window.from)).toBe("2026-08-01T00:00:00.000Z");
      expect(iso(window.to)).toBe("2026-08-09T23:59:59.999Z");
    }
  });

  it("always produces inclusive, UTC-calendar boundaries", () => {
    for (const period of [
      BudgetPeriod.Weekly,
      BudgetPeriod.Monthly,
      BudgetPeriod.Yearly,
      BudgetPeriod.Custom,
    ]) {
      const window = resolveBudgetPeriodWindow(period, "2026-01-01", now);
      expect(window.from.getTime() % 1000).toBe(0);
      expect(window.to.getMilliseconds()).toBe(999);
      expect(window.from.getTime() <= window.to.getTime()).toBe(true);
    }
  });
});
