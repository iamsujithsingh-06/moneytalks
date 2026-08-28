import { describe, expect, it } from "vitest";
import {
  BudgetAlertStatus,
  BudgetPeriod,
  BudgetScope,
  BudgetStatus,
  MINOR_AMOUNT_MAX,
  calculateBudgetPercent,
  deriveBudgetAlertStatus,
} from "@moneytalks/shared";

describe("BudgetScope enum", () => {
  it("exposes category and overall", () => {
    expect(BudgetScope.Category).toBe("category");
    expect(BudgetScope.Overall).toBe("overall");
  });

  it("covers exactly the documented values", () => {
    expect(Object.values(BudgetScope)).toEqual(["category", "overall"]);
  });
});

describe("BudgetPeriod enum", () => {
  it("exposes weekly, monthly, yearly and custom", () => {
    expect(BudgetPeriod.Weekly).toBe("weekly");
    expect(BudgetPeriod.Monthly).toBe("monthly");
    expect(BudgetPeriod.Yearly).toBe("yearly");
    expect(BudgetPeriod.Custom).toBe("custom");
  });

  it("covers exactly the documented values", () => {
    expect(Object.values(BudgetPeriod)).toEqual([
      "weekly",
      "monthly",
      "yearly",
      "custom",
    ]);
  });
});

describe("BudgetStatus enum", () => {
  it("exposes active, paused and completed", () => {
    expect(BudgetStatus.Active).toBe("active");
    expect(BudgetStatus.Paused).toBe("paused");
    expect(BudgetStatus.Completed).toBe("completed");
  });

  it("covers exactly the documented values", () => {
    expect(Object.values(BudgetStatus)).toEqual([
      "active",
      "paused",
      "completed",
    ]);
  });
});

describe("BudgetAlertStatus enum", () => {
  it("exposes ok, warning and over", () => {
    expect(BudgetAlertStatus.Ok).toBe("ok");
    expect(BudgetAlertStatus.Warning).toBe("warning");
    expect(BudgetAlertStatus.Over).toBe("over");
  });

  it("covers exactly the documented values", () => {
    expect(Object.values(BudgetAlertStatus)).toEqual(["ok", "warning", "over"]);
  });
});

describe("calculateBudgetPercent", () => {
  it("returns 0 when nothing is spent", () => {
    expect(calculateBudgetPercent(10_000, 0)).toBe(0);
  });

  it("returns 50 when half is spent", () => {
    expect(calculateBudgetPercent(10_000, 5_000)).toBe(50);
  });

  it("returns 100 when fully spent", () => {
    expect(calculateBudgetPercent(10_000, 10_000)).toBe(100);
  });

  it("returns over 100 when over budget", () => {
    expect(calculateBudgetPercent(10_000, 15_000)).toBe(150);
  });

  it("handles zero allocation without NaN or Infinity", () => {
    expect(calculateBudgetPercent(0, 0)).toBe(0);
    expect(calculateBudgetPercent(0, 5_000)).toBe(0);
    expect(Number.isNaN(calculateBudgetPercent(0, 5_000))).toBe(false);
    expect(Number.isFinite(calculateBudgetPercent(0, 5_000))).toBe(true);
  });

  it("handles negative or non-integer allocation defensively", () => {
    expect(calculateBudgetPercent(-1, 5_000)).toBe(0);
    expect(calculateBudgetPercent(1.5, 5_000)).toBe(0);
    expect(Number.isFinite(calculateBudgetPercent(-1, 5_000))).toBe(true);
  });

  it("works with integer minor-unit values (no float drift)", () => {
    expect(calculateBudgetPercent(1, 1)).toBe(100);
    expect(calculateBudgetPercent(33, 33)).toBe(100);
    expect(calculateBudgetPercent(100_000_000, 25_000_000)).toBe(25);
    expect(Number.isInteger(calculateBudgetPercent(3, 1))).toBe(false);
  });

  it("never returns NaN or Infinity for valid integer inputs", () => {
    const pct = calculateBudgetPercent(1, MINOR_AMOUNT_MAX);
    expect(Number.isNaN(pct)).toBe(false);
    expect(Number.isFinite(pct)).toBe(true);
  });

  it("is deterministic for the same inputs", () => {
    const a = calculateBudgetPercent(12_345, 6_789);
    const b = calculateBudgetPercent(12_345, 6_789);
    expect(a).toBe(b);
    expect(Number.isFinite(a)).toBe(true);
  });
});

describe("deriveBudgetAlertStatus", () => {
  const thresholds = { warningPct: 80, hardPct: 100 };

  it("is ok below the warning threshold", () => {
    expect(deriveBudgetAlertStatus(0, thresholds)).toBe(BudgetAlertStatus.Ok);
    expect(deriveBudgetAlertStatus(50, thresholds)).toBe(BudgetAlertStatus.Ok);
    expect(deriveBudgetAlertStatus(79, thresholds)).toBe(BudgetAlertStatus.Ok);
  });

  it("is warning at the warning threshold", () => {
    expect(deriveBudgetAlertStatus(80, thresholds)).toBe(
      BudgetAlertStatus.Warning,
    );
  });

  it("is warning between the warning and hard thresholds", () => {
    expect(deriveBudgetAlertStatus(90, thresholds)).toBe(
      BudgetAlertStatus.Warning,
    );
    expect(deriveBudgetAlertStatus(99, thresholds)).toBe(
      BudgetAlertStatus.Warning,
    );
  });

  it("is over at the hard threshold", () => {
    expect(deriveBudgetAlertStatus(100, thresholds)).toBe(
      BudgetAlertStatus.Over,
    );
  });

  it("is over above the hard threshold", () => {
    expect(deriveBudgetAlertStatus(120, thresholds)).toBe(
      BudgetAlertStatus.Over,
    );
  });
});

describe("budget percent + alert status", () => {
  const thresholds = { warningPct: 80, hardPct: 100 };

  it("maps spend to alert status deterministically", () => {
    expect(
      deriveBudgetAlertStatus(
        calculateBudgetPercent(10_000, 5_000),
        thresholds,
      ),
    ).toBe(BudgetAlertStatus.Ok);
    expect(
      deriveBudgetAlertStatus(
        calculateBudgetPercent(10_000, 8_000),
        thresholds,
      ),
    ).toBe(BudgetAlertStatus.Warning);
    expect(
      deriveBudgetAlertStatus(
        calculateBudgetPercent(10_000, 10_000),
        thresholds,
      ),
    ).toBe(BudgetAlertStatus.Over);
    expect(
      deriveBudgetAlertStatus(
        calculateBudgetPercent(10_000, 12_000),
        thresholds,
      ),
    ).toBe(BudgetAlertStatus.Over);
  });

  it("reports a zero-allocated budget as ok at 0%", () => {
    const pct = calculateBudgetPercent(0, 5_000);
    expect(pct).toBe(0);
    expect(deriveBudgetAlertStatus(pct, thresholds)).toBe(BudgetAlertStatus.Ok);
  });
});
