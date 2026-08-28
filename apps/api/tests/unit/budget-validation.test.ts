import { describe, expect, it } from "vitest";
import {
  budgetListQuerySchema,
  budgetParamsSchema,
  createBudgetSchema,
  updateBudgetSchema,
} from "@moneytalks/validation";

const VALID_UUID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OBJECT_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";

function budgetBody(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    clientId: VALID_UUID,
    scope: "category",
    categoryId: OBJECT_ID,
    period: "monthly",
    allocatedMinor: 10_000,
    currency: "INR",
    ...overrides,
  };
}

describe("createBudgetSchema", () => {
  it("parses a valid category budget", () => {
    const result = createBudgetSchema.safeParse(budgetBody());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.rollover).toBe(false);
    expect(result.data.status).toBe("active");
    expect(result.data.currency).toBe("INR");
    expect(result.data.alertThresholds).toEqual({ warningPct: 80, hardPct: 100 });
    expect(result.data.periodAnchor).toBeUndefined();
  });

  it("parses a valid overall budget without a category", () => {
    const result = createBudgetSchema.safeParse(
      budgetBody({ scope: "overall", categoryId: undefined }),
    );
    expect(result.success).toBe(true);
  });

  it("parses a valid custom budget with a periodAnchor", () => {
    const result = createBudgetSchema.safeParse(
      budgetBody({ period: "custom", periodAnchor: "2026-03-01" }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts every scope and period", () => {
    for (const scope of ["category", "overall"]) {
      for (const period of ["weekly", "monthly", "yearly", "custom"]) {
        const body = budgetBody({ scope, period });
        if (period === "custom") body.periodAnchor = "2026-01-01";
        if (scope === "overall") delete body.categoryId;
        const result = createBudgetSchema.safeParse(body);
        expect(result.success).toBe(true);
      }
    }
  });

  it("rejects an invalid scope", () => {
    const result = createBudgetSchema.safeParse(budgetBody({ scope: "global" }));
    expect(result.success).toBe(false);
  });

  it("rejects an invalid period", () => {
    const result = createBudgetSchema.safeParse(budgetBody({ period: "daily" }));
    expect(result.success).toBe(false);
  });

  it("rejects an invalid categoryId", () => {
    const result = createBudgetSchema.safeParse(
      budgetBody({ categoryId: "nope" }),
    );
    expect(result.success).toBe(false);
  });

  it("requires categoryId for category scope", () => {
    const result = createBudgetSchema.safeParse(
      budgetBody({ categoryId: undefined }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "categoryId")).toBe(
        true,
      );
    }
  });

  it("forbids categoryId for overall scope", () => {
    const result = createBudgetSchema.safeParse(
      budgetBody({ scope: "overall" }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "categoryId")).toBe(
        true,
      );
    }
  });

  it("requires periodAnchor for custom period", () => {
    const result = createBudgetSchema.safeParse(budgetBody({ period: "custom" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "periodAnchor")).toBe(
        true,
      );
    }
  });

  it("forbids periodAnchor for non-custom periods", () => {
    const result = createBudgetSchema.safeParse(
      budgetBody({ periodAnchor: "2026-01-01" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects an invalid periodAnchor date", () => {
    for (const anchor of ["2026-02-30", "not-a-date", "01-01-2026"]) {
      const result = createBudgetSchema.safeParse(
        budgetBody({ period: "custom", periodAnchor: anchor }),
      );
      expect(result.success).toBe(false);
    }
  });

  it("rejects a non-positive or non-integer allocatedMinor", () => {
    for (const value of [0, -1, 1.5, "1000", Number.NaN]) {
      const result = createBudgetSchema.safeParse(
        budgetBody({ allocatedMinor: value }),
      );
      expect(result.success).toBe(false);
    }
  });

  it("rejects an unsupported currency", () => {
    const result = createBudgetSchema.safeParse(budgetBody({ currency: "XYZ" }));
    expect(result.success).toBe(false);
  });

  it("uppercases a lowercase currency", () => {
    const result = createBudgetSchema.safeParse(budgetBody({ currency: "inr" }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.currency).toBe("INR");
  });

  it("accepts a valid rollover and status", () => {
    const result = createBudgetSchema.safeParse(
      budgetBody({ rollover: true, status: "paused" }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.rollover).toBe(true);
    expect(result.data.status).toBe("paused");
  });

  it("rejects an invalid status", () => {
    const result = createBudgetSchema.safeParse(budgetBody({ status: "archived" }));
    expect(result.success).toBe(false);
  });

  it("rejects an invalid rollover type", () => {
    const result = createBudgetSchema.safeParse(budgetBody({ rollover: "yes" }));
    expect(result.success).toBe(false);
  });

  it("accepts valid alertThresholds", () => {
    const result = createBudgetSchema.safeParse(
      budgetBody({ alertThresholds: { warningPct: 60, hardPct: 90 } }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects hardPct below warningPct", () => {
    const result = createBudgetSchema.safeParse(
      budgetBody({ alertThresholds: { warningPct: 80, hardPct: 70 } }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("hardPct"))).toBe(
        true,
      );
    }
  });

  it("rejects threshold values outside 1-100 or non-integers", () => {
    for (const thresholds of [
      { warningPct: 0, hardPct: 100 },
      { warningPct: 80, hardPct: 101 },
      { warningPct: 80.5, hardPct: 100 },
      { warningPct: "80", hardPct: 100 },
    ]) {
      const result = createBudgetSchema.safeParse(
        budgetBody({ alertThresholds: thresholds }),
      );
      expect(result.success).toBe(false);
    }
  });

  it("rejects unknown keys (strict)", () => {
    const result = createBudgetSchema.safeParse(budgetBody({ bogus: true }));
    expect(result.success).toBe(false);
  });

  it("rejects server-controlled and derived fields", () => {
    for (const key of [
      "id",
      "userId",
      "spentMinor",
      "percent",
      "alertStatus",
      "deleted",
      "deletedAt",
      "deletedBy",
      "rev",
      "createdAt",
      "updatedAt",
    ]) {
      const result = createBudgetSchema.safeParse(budgetBody({ [key]: 1 }));
      expect(result.success).toBe(false);
    }
  });
});

describe("updateBudgetSchema", () => {
  it("parses a valid partial update", () => {
    const result = updateBudgetSchema.safeParse({
      allocatedMinor: 20_000,
      rollover: true,
      status: "completed",
      alertThresholds: { warningPct: 70, hardPct: 95 },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.allocatedMinor).toBe(20_000);
    expect(result.data.alertThresholds).toEqual({ warningPct: 70, hardPct: 95 });
  });

  it("rejects an empty update", () => {
    const result = updateBudgetSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("allows changing categoryId, period and periodAnchor", () => {
    expect(
      updateBudgetSchema.safeParse({ categoryId: OBJECT_ID }).success,
    ).toBe(true);
    expect(
      updateBudgetSchema.safeParse({
        period: "custom",
        periodAnchor: "2026-04-01",
      }).success,
    ).toBe(true);
    expect(updateBudgetSchema.safeParse({ period: "yearly" }).success).toBe(true);
  });

  it("forbids periodAnchor on non-custom periods when period is provided", () => {
    const result = updateBudgetSchema.safeParse({
      period: "monthly",
      periodAnchor: "2026-01-01",
    });
    expect(result.success).toBe(false);
  });

  it("requires periodAnchor when switching to custom", () => {
    const result = updateBudgetSchema.safeParse({ period: "custom" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid money, currency and thresholds", () => {
    expect(
      updateBudgetSchema.safeParse({ allocatedMinor: 0 }).success,
    ).toBe(false);
    expect(
      updateBudgetSchema.safeParse({ currency: "XYZ" }).success,
    ).toBe(false);
    expect(
      updateBudgetSchema.safeParse({
        alertThresholds: { warningPct: 90, hardPct: 50 },
      }).success,
    ).toBe(false);
  });

  it("rejects immutable and server-controlled fields", () => {
    for (const key of [
      "id",
      "clientId",
      "userId",
      "scope",
      "spentMinor",
      "percent",
      "alertStatus",
      "deleted",
      "deletedAt",
      "deletedBy",
      "rev",
      "createdAt",
      "updatedAt",
    ]) {
      const result = updateBudgetSchema.safeParse({
        allocatedMinor: 5_000,
        [key]: key === "scope" ? "overall" : true,
      });
      expect(result.success).toBe(false);
    }
  });

  it("rejects unknown keys (strict)", () => {
    const result = updateBudgetSchema.safeParse({ bogus: true });
    expect(result.success).toBe(false);
  });
});

describe("budget params and list/summary query", () => {
  it("parses a valid id param", () => {
    expect(budgetParamsSchema.safeParse({ id: OBJECT_ID }).success).toBe(true);
  });

  it("rejects an invalid id param", () => {
    expect(budgetParamsSchema.safeParse({ id: "nope" }).success).toBe(false);
  });

  it("parses a valid list query", () => {
    expect(budgetListQuerySchema.safeParse({}).success).toBe(true);
    expect(
      budgetListQuerySchema.safeParse({ period: "monthly" }).success,
    ).toBe(true);
    expect(
      budgetListQuerySchema.safeParse({
        from: "2026-01-01",
        to: "2026-01-31",
      }).success,
    ).toBe(true);
  });

  it("rejects an invalid list period", () => {
    const result = budgetListQuerySchema.safeParse({ period: "daily" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid from/to dates", () => {
    expect(
      budgetListQuerySchema.safeParse({ from: "2026-02-30" }).success,
    ).toBe(false);
    expect(
      budgetListQuerySchema.safeParse({ to: "2026-13-01" }).success,
    ).toBe(false);
  });

  it("rejects from after to", () => {
    const result = budgetListQuerySchema.safeParse({
      from: "2026-02-01",
      to: "2026-01-31",
    });
    expect(result.success).toBe(false);
  });
});
