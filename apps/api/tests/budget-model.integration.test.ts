import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  BudgetPeriod,
  BudgetScope,
  BudgetStatus,
} from "@moneytalks/shared";
import { syncDbIndexes } from "../src/db/index.js";
import { BudgetModel } from "../src/db/models/budget.js";
import type { AppLogger } from "../src/lib/logger.js";
import {
  clearDatabase,
  closeDatabase,
  createTestApp,
} from "./helpers/test-app.js";

const userA = new Types.ObjectId();
const userB = new Types.ObjectId();
const categoryA = new Types.ObjectId();
const categoryB = new Types.ObjectId();

function budgetInput(overrides: Record<string, unknown> = {}) {
  return {
    userId: userA,
    clientId: randomUUID(),
    categoryId: categoryA,
    scope: "category",
    period: "monthly",
    allocatedMinor: 10_000,
    currency: "INR",
    rollover: false,
    status: "active",
    alertThresholds: { warningPct: 80, hardPct: 100 },
    ...overrides,
  };
}

function overallInput(overrides: Record<string, unknown> = {}) {
  return budgetInput({
    scope: "overall",
    categoryId: null,
    ...overrides,
  });
}

describe("budget model foundation", () => {
  let logger: AppLogger;

  beforeAll(async () => {
    const ctx = await createTestApp();
    logger = ctx.logger;
    await syncDbIndexes(logger);
  });

  beforeEach(async () => {
    await clearDatabase();
    await syncDbIndexes(logger);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  describe("BudgetModel", () => {
    it("creates a valid budget with defaults and timestamps", async () => {
      const budget = await BudgetModel.create(budgetInput());
      expect(budget.id).toBeTruthy();
      expect(budget.userId.toString()).toBe(userA.toString());
      expect(budget.categoryId?.toString()).toBe(categoryA.toString());
      expect(budget.scope).toBe(BudgetScope.Category);
      expect(budget.period).toBe(BudgetPeriod.Monthly);
      expect(budget.allocatedMinor).toBe(10_000);
      expect(budget.currency).toBe("INR");
      expect(budget.rollover).toBe(false);
      expect(budget.status).toBe(BudgetStatus.Active);
      expect(budget.alertThresholds?.warningPct).toBe(80);
      expect(budget.alertThresholds?.hardPct).toBe(100);
      expect(budget.periodAnchor).toBeNull();
      expect(budget.deletedAt).toBeNull();
      expect(budget.rev).toBe(0);
      expect(budget.createdAt).toBeInstanceOf(Date);
      expect(budget.updatedAt).toBeInstanceOf(Date);
    });

    it("rejects an invalid scope", async () => {
      await expect(
        BudgetModel.create(budgetInput({ scope: "global" })),
      ).rejects.toMatchObject({ name: "ValidationError" });
    });

    it("rejects an invalid period", async () => {
      await expect(
        BudgetModel.create(budgetInput({ period: "daily" })),
      ).rejects.toMatchObject({ name: "ValidationError" });
    });

    it("rejects an invalid status", async () => {
      await expect(
        BudgetModel.create(budgetInput({ status: "archived" })),
      ).rejects.toMatchObject({ name: "ValidationError" });
    });

    it("rejects invalid allocatedMinor values", async () => {
      for (const value of [0, -1, 1.5]) {
        await expect(
          BudgetModel.create(budgetInput({ allocatedMinor: value })),
        ).rejects.toMatchObject({ name: "ValidationError" });
      }
    });

    it("rejects invalid alertThresholds", async () => {
      await expect(
        BudgetModel.create(
          budgetInput({ alertThresholds: { warningPct: 0, hardPct: 100 } }),
        ),
      ).rejects.toMatchObject({ name: "ValidationError" });
      await expect(
        BudgetModel.create(
          budgetInput({ alertThresholds: { warningPct: 80, hardPct: 101 } }),
        ),
      ).rejects.toMatchObject({ name: "ValidationError" });
      await expect(
        BudgetModel.create(
          budgetInput({ alertThresholds: { warningPct: 90, hardPct: 50 } }),
        ),
      ).rejects.toMatchObject({ name: "ValidationError" });
    });

    it("rejects documents missing required fields", async () => {
      await expect(BudgetModel.create({ scope: "category" })).rejects.toMatchObject(
        { name: "ValidationError" },
      );
      await expect(
        BudgetModel.create(budgetInput({ scope: undefined })),
      ).rejects.toMatchObject({ name: "ValidationError" });
      await expect(
        BudgetModel.create(budgetInput({ allocatedMinor: undefined })),
      ).rejects.toMatchObject({ name: "ValidationError" });
      await expect(
        BudgetModel.create(budgetInput({ currency: undefined })),
      ).rejects.toMatchObject({ name: "ValidationError" });
    });

    it("enforces the unique active category budget index", async () => {
      const input = budgetInput({ categoryId: categoryB });
      await BudgetModel.create(input);
      await expect(
        BudgetModel.create({ ...input, clientId: randomUUID() }),
      ).rejects.toMatchObject({ code: 11000 });
    });

    it("allows the same category across different periods", async () => {
      await BudgetModel.create(budgetInput({ period: "monthly" }));
      await expect(
        BudgetModel.create(budgetInput({ period: "weekly" })),
      ).resolves.toBeTruthy();
    });

    it("allows the same category + period for a different user", async () => {
      await BudgetModel.create(budgetInput());
      await expect(
        BudgetModel.create(budgetInput({ userId: userB })),
      ).resolves.toBeTruthy();
    });

    it("allows a soft-deleted budget to coexist with a new active one", async () => {
      await BudgetModel.create(
        budgetInput({
          deletedAt: new Date("2026-01-01T00:00:00Z"),
          deletedBy: userA,
        }),
      );
      await expect(
        BudgetModel.create(budgetInput({ categoryId: categoryB })),
      ).resolves.toBeTruthy();
    });

    it("allows a paused budget to coexist with a new active one", async () => {
      await BudgetModel.create(budgetInput({ status: "paused" }));
      await expect(
        BudgetModel.create(budgetInput({ categoryId: categoryB })),
      ).resolves.toBeTruthy();
    });

    it("enforces the unique active overall budget index", async () => {
      await BudgetModel.create(overallInput());
      await expect(
        BudgetModel.create(overallInput()),
      ).rejects.toMatchObject({ code: 11000 });
    });

    it("allows one overall and one category budget for the same period", async () => {
      await BudgetModel.create(overallInput());
      await expect(BudgetModel.create(budgetInput())).resolves.toBeTruthy();
    });

    it("allows a soft-deleted overall budget to coexist with a new active one", async () => {
      await BudgetModel.create(
        overallInput({ deletedAt: new Date("2026-01-01T00:00:00Z") }),
      );
      await expect(BudgetModel.create(overallInput())).resolves.toBeTruthy();
    });

    it("enforces the {userId, clientId} unique index", async () => {
      const clientId = randomUUID();
      await BudgetModel.create(budgetInput({ clientId, categoryId: categoryB }));
      await expect(
        BudgetModel.create(
          budgetInput({ clientId, categoryId: categoryA }),
        ),
      ).rejects.toMatchObject({ code: 11000 });
      await expect(
        BudgetModel.create(
          overallInput({ clientId, userId: userB }),
        ),
      ).resolves.toBeTruthy();
    });

    it("stores a custom periodAnchor", async () => {
      const budget = await BudgetModel.create(
        budgetInput({
          period: "custom",
          periodAnchor: new Date("2026-03-01T00:00:00.000Z"),
        }),
      );
      expect(budget.periodAnchor?.toISOString()).toBe(
        "2026-03-01T00:00:00.000Z",
      );
    });

    it("is user-scoped by default on queries", async () => {
      await BudgetModel.create(budgetInput({ categoryId: categoryB }));
      const theirs = await BudgetModel.find({ userId: userB }).exec();
      expect(theirs.length).toBe(0);
      const mine = await BudgetModel.find({ userId: userA }).exec();
      expect(mine.length).toBeGreaterThan(0);
    });
  });
});
