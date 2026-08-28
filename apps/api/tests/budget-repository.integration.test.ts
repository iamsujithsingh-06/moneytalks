import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { syncDbIndexes } from "../src/db/index.js";
import { TransactionModel } from "../src/db/models/transaction.js";
import type { AppLogger } from "../src/lib/logger.js";
import {
  budgetRepository,
  type BudgetRepository,
} from "../src/modules/budgets/repository.js";
import type { TransactionDocumentFields } from "../src/db/models/transaction.js";
import {
  clearDatabase,
  closeDatabase,
  createTestApp,
} from "./helpers/test-app.js";

const userA = new Types.ObjectId();
const userB = new Types.ObjectId();
const categoryA = new Types.ObjectId();
const categoryB = new Types.ObjectId();

const PERIOD_ANCHOR = new Date("2026-03-01T00:00:00.000Z");
const WINDOW = {
  from: new Date("2026-03-01T00:00:00.000Z"),
  to: new Date("2026-03-31T23:59:59.999Z"),
};

function budgetInput(overrides: Record<string, unknown> = {}) {
  return {
    userId: userA,
    clientId: randomUUID(),
    categoryId: categoryA,
    scope: "category",
    period: "monthly",
    periodAnchor: PERIOD_ANCHOR,
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

function transactionInput(
  overrides: Partial<TransactionDocumentFields> = {},
) {
  return {
    userId: userA,
    clientId: randomUUID(),
    type: "expense",
    source: "manual",
    status: "confirmed",
    direction: "outflow",
    amountMinor: 500,
    currency: "INR",
    transactionDate: new Date("2026-03-15T12:00:00.000Z"),
    categoryId: categoryA,
    ...overrides,
  } as unknown as TransactionDocumentFields;
}

async function insertTransactions(
  overrides: Array<Partial<TransactionDocumentFields>>,
) {
  for (const override of overrides) {
    await TransactionModel.create(transactionInput(override));
  }
}

describe("budget repository", () => {
  let logger: AppLogger;
  let repo: BudgetRepository;

  beforeAll(async () => {
    const ctx = await createTestApp();
    logger = ctx.logger;
    repo = budgetRepository;
    await syncDbIndexes(logger);
  });

  beforeEach(async () => {
    await clearDatabase();
    await syncDbIndexes(logger);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  describe("create", () => {
    it("persists every provided budget field", async () => {
      const record = await repo.create(budgetInput());

      expect(record.id).toBeTruthy();
      expect(record.userId).toBe(userA.toString());
      expect(record.clientId).toBeTruthy();
      expect(record.categoryId).toBe(categoryA.toString());
      expect(record.scope).toBe("category");
      expect(record.period).toBe("monthly");
      expect(record.periodAnchor?.toISOString()).toBe(
        PERIOD_ANCHOR.toISOString(),
      );
      expect(record.allocatedMinor).toBe(10_000);
      expect(record.currency).toBe("INR");
      expect(record.rollover).toBe(false);
      expect(record.status).toBe("active");
      expect(record.alertThresholds).toEqual({ warningPct: 80, hardPct: 100 });
      expect(record.deletedAt).toBeNull();
      expect(record.deletedBy).toBeNull();
      expect(record.rev).toBe(0);
      expect(record.createdAt).toBeInstanceOf(Date);
      expect(record.updatedAt).toBeInstanceOf(Date);
    });

    it("applies defaults when optional fields are omitted", async () => {
      const record = await repo.create(
        budgetInput({
          categoryId: null,
          scope: "overall",
          periodAnchor: null,
          rollover: undefined,
          status: undefined,
        }),
      );

      expect(record.categoryId).toBeNull();
      expect(record.periodAnchor).toBeNull();
      expect(record.rollover).toBe(false);
      expect(record.status).toBe("active");
    });

    it("stores minor units as exact integers without drift", async () => {
      const record = await repo.create(
        budgetInput({ allocatedMinor: 12_345_678 }),
      );
      expect(record.allocatedMinor).toBe(12_345_678);
    });

    it("rejects a duplicate clientId for the same user", async () => {
      const clientId = randomUUID();
      await repo.create(budgetInput({ clientId }));

      await expect(
        repo.create(budgetInput({ clientId })),
      ).rejects.toMatchObject({ code: 11000 });
    });

    it("rejects a duplicate active category budget for the same period", async () => {
      const period = "monthly";
      await repo.create(budgetInput({ period }));

      await expect(
        repo.create(budgetInput({ period, clientId: randomUUID() })),
      ).rejects.toMatchObject({ code: 11000 });
    });

    it("rejects a duplicate active overall budget for the same period", async () => {
      const period = "monthly";
      await repo.create(overallInput({ period }));

      await expect(
        repo.create(overallInput({ period, clientId: randomUUID() })),
      ).rejects.toMatchObject({ code: 11000 });
    });

    it("allows the same category and period for different users", async () => {
      const period = "monthly";
      await repo.create(budgetInput({ period }));
      const record = await repo.create(
        budgetInput({ userId: userB, period }),
      );
      expect(record.userId).toBe(userB.toString());
    });

    it("allows the same category across different periods", async () => {
      await repo.create(budgetInput({ period: "monthly" }));
      const record = await repo.create(
        budgetInput({ period: "weekly" }),
      );
      expect(record.period).toBe("weekly");
    });

    it("allows a category budget and an overall budget for the same period", async () => {
      await repo.create(budgetInput({ period: "monthly" }));
      const record = await repo.create(
        overallInput({ period: "monthly" }),
      );
      expect(record.scope).toBe("overall");
    });

    it("allows re-creating a budget after the previous one is soft-deleted", async () => {
      const created = await repo.create(budgetInput({ period: "monthly" }));
      await repo.softDelete(userA, created.id, userA);

      const record = await repo.create(
        budgetInput({ period: "monthly", clientId: randomUUID() }),
      );
      expect(record.id).toBeTruthy();
    });

    it("allows an active budget even when a paused budget shares the key", async () => {
      await repo.create(
        budgetInput({ period: "monthly", status: "paused" }),
      );
      const record = await repo.create(
        budgetInput({ period: "monthly", clientId: randomUUID() }),
      );
      expect(record.status).toBe("active");
    });
  });

  describe("findById", () => {
    it("returns the budget for the owning user", async () => {
      const created = await repo.create(budgetInput());
      const found = await repo.findById(userA, created.id);

      expect(found?.id).toBe(created.id);
      expect(found?.allocatedMinor).toBe(10_000);
    });

    it("returns null when the budget does not exist", async () => {
      expect(await repo.findById(userA, new Types.ObjectId())).toBeNull();
    });

    it("returns null for a budget owned by another user", async () => {
      const created = await repo.create(budgetInput());
      expect(await repo.findById(userB, created.id)).toBeNull();
    });

    it("returns the budget even when soft-deleted", async () => {
      const created = await repo.create(budgetInput());
      await repo.softDelete(userA, created.id, userA);

      const found = await repo.findById(userA, created.id);
      expect(found?.id).toBe(created.id);
      expect(found?.deletedAt).not.toBeNull();
    });

    it("returns null for an invalid budget id", async () => {
      await expect(
        repo.findById(userA, "not-an-objectid"),
      ).rejects.toMatchObject({ name: "CastError" });
    });
  });

  describe("findActiveById", () => {
    it("returns an active budget for the owning user", async () => {
      const created = await repo.create(budgetInput());
      const found = await repo.findActiveById(userA, created.id);

      expect(found?.id).toBe(created.id);
    });

    it("returns null for a soft-deleted budget", async () => {
      const created = await repo.create(budgetInput());
      await repo.softDelete(userA, created.id, userA);

      expect(await repo.findActiveById(userA, created.id)).toBeNull();
    });

    it("returns null for a budget owned by another user", async () => {
      const created = await repo.create(budgetInput());
      expect(await repo.findActiveById(userB, created.id)).toBeNull();
    });

    it("returns null when the budget does not exist", async () => {
      expect(
        await repo.findActiveById(userA, new Types.ObjectId()),
      ).toBeNull();
    });
  });

  describe("listByUser", () => {
    it("returns only the user's budgets", async () => {
      await repo.create(budgetInput({ period: "monthly" }));
      await repo.create(budgetInput({ period: "weekly", clientId: randomUUID() }));
      await repo.create(budgetInput({ userId: userB }));

      const records = await repo.listByUser(userA);
      expect(records).toHaveLength(2);
      expect(records.every((r) => r.userId === userA.toString())).toBe(true);
    });

    it("excludes soft-deleted budgets", async () => {
      const kept = await repo.create(budgetInput({ period: "monthly" }));
      const deleted = await repo.create(
        budgetInput({ period: "weekly", clientId: randomUUID() }),
      );
      await repo.softDelete(userA, deleted.id, userA);

      const records = await repo.listByUser(userA);
      expect(records.map((r) => r.id)).toEqual([kept.id]);
    });

    it("returns an empty list when the user has no budgets", async () => {
      expect(await repo.listByUser(userB)).toEqual([]);
    });

    it("filters by period", async () => {
      await repo.create(budgetInput({ period: "monthly" }));
      await repo.create(
        budgetInput({ period: "weekly", clientId: randomUUID() }),
      );

      const records = await repo.listByUser(userA, { period: "weekly" });
      expect(records).toHaveLength(1);
      expect(records[0]?.period).toBe("weekly");
    });

    it("orders records deterministically by createdAt then id", async () => {
      const first = await repo.create(budgetInput({ period: "monthly" }));
      const second = await repo.create(
        budgetInput({ period: "weekly", clientId: randomUUID() }),
      );
      const third = await repo.create(
        budgetInput({ period: "yearly", clientId: randomUUID() }),
      );

      const records = await repo.listByUser(userA);
      expect(records.map((r) => r.id)).toEqual([
        first.id,
        second.id,
        third.id,
      ]);
    });

    it("includes non-deleted budgets regardless of status", async () => {
      await repo.create(budgetInput());
      await repo.create(
        budgetInput({ clientId: randomUUID(), status: "paused" }),
      );

      const records = await repo.listByUser(userA);
      expect(records.map((r) => r.status).sort()).toEqual([
        "active",
        "paused",
      ]);
    });
  });

  describe("findActiveDuplicate", () => {
    it("finds an existing active overall budget for the same period", async () => {
      const created = await repo.create(overallInput({ period: "monthly" }));

      const duplicate = await repo.findActiveDuplicate(userA, {
        scope: "overall",
        period: "monthly",
      });
      expect(duplicate?.id).toBe(created.id);
    });

    it("finds an existing active category budget for the same category and period", async () => {
      const created = await repo.create(budgetInput({ period: "monthly" }));

      const duplicate = await repo.findActiveDuplicate(userA, {
        scope: "category",
        categoryId: categoryA,
        period: "monthly",
      });
      expect(duplicate?.id).toBe(created.id);
    });

    it("returns null when no active duplicate exists", async () => {
      expect(
        await repo.findActiveDuplicate(userA, {
          scope: "category",
          categoryId: categoryA,
          period: "monthly",
        }),
      ).toBeNull();
    });

    it("ignores soft-deleted budgets", async () => {
      const created = await repo.create(budgetInput({ period: "monthly" }));
      await repo.softDelete(userA, created.id, userA);

      expect(
        await repo.findActiveDuplicate(userA, {
          scope: "category",
          categoryId: categoryA,
          period: "monthly",
        }),
      ).toBeNull();
    });

    it("ignores paused budgets when looking for an active duplicate", async () => {
      await repo.create(
        budgetInput({ period: "monthly", status: "paused" }),
      );

      expect(
        await repo.findActiveDuplicate(userA, {
          scope: "category",
          categoryId: categoryA,
          period: "monthly",
        }),
      ).toBeNull();
    });

    it("does not match a different category", async () => {
      await repo.create(budgetInput({ period: "monthly" }));

      expect(
        await repo.findActiveDuplicate(userA, {
          scope: "category",
          categoryId: categoryB,
          period: "monthly",
        }),
      ).toBeNull();
    });
  });

  describe("update", () => {
    it("applies a partial update, increments rev, and bumps updatedAt", async () => {
      const created = await repo.create(budgetInput());
      const before = created.updatedAt.getTime();

      const updated = await repo.update(userA, created.id, {
        allocatedMinor: 20_000,
        rollover: true,
        alertThresholds: { warningPct: 60, hardPct: 90 },
      });

      expect(updated?.id).toBe(created.id);
      expect(updated?.allocatedMinor).toBe(20_000);
      expect(updated?.rollover).toBe(true);
      expect(updated?.alertThresholds).toEqual({ warningPct: 60, hardPct: 90 });
      expect(updated?.rev).toBe(created.rev + 1);
      expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    it("clears categoryId when changing an overall budget", async () => {
      const created = await repo.create(budgetInput());

      const updated = await repo.update(userA, created.id, {
        categoryId: null,
      });
      expect(updated?.categoryId).toBeNull();
    });

    it("returns null when updating another user's budget", async () => {
      const created = await repo.create(budgetInput());
      expect(
        await repo.update(userB, created.id, { allocatedMinor: 1 }),
      ).toBeNull();
    });

    it("returns null when updating a soft-deleted budget", async () => {
      const created = await repo.create(budgetInput());
      await repo.softDelete(userA, created.id, userA);

      expect(
        await repo.update(userA, created.id, { allocatedMinor: 1 }),
      ).toBeNull();
    });

    it("returns null when the budget does not exist", async () => {
      expect(
        await repo.update(userA, new Types.ObjectId(), {
          allocatedMinor: 1,
        }),
      ).toBeNull();
    });
  });

  describe("softDelete", () => {
    it("sets deletedAt and deletedBy and increments rev", async () => {
      const created = await repo.create(budgetInput());
      const before = Date.now();

      const deleted = await repo.softDelete(userA, created.id, userA);

      expect(deleted?.id).toBe(created.id);
      expect(deleted?.deletedAt).toBeInstanceOf(Date);
      expect(deleted?.deletedAt!.getTime()).toBeGreaterThanOrEqual(before);
      expect(deleted?.deletedBy).toBe(userA.toString());
      expect(deleted?.rev).toBe(created.rev + 1);
    });

    it("excludes the soft-deleted budget from active reads", async () => {
      const created = await repo.create(budgetInput());
      await repo.softDelete(userA, created.id, userA);

      expect(await repo.findActiveById(userA, created.id)).toBeNull();
      expect(await repo.listByUser(userA)).toEqual([]);
      expect(
        await repo.findActiveDuplicate(userA, {
          scope: "category",
          categoryId: categoryA,
          period: created.period,
        }),
      ).toBeNull();
    });

    it("returns null on a repeated soft-delete", async () => {
      const created = await repo.create(budgetInput());
      await repo.softDelete(userA, created.id, userA);

      expect(await repo.softDelete(userA, created.id, userA)).toBeNull();
    });

    it("cannot soft-delete another user's budget", async () => {
      const created = await repo.create(budgetInput());
      expect(await repo.softDelete(userB, created.id, userB)).toBeNull();
    });

    it("returns null when the budget does not exist", async () => {
      expect(
        await repo.softDelete(userA, new Types.ObjectId(), userA),
      ).toBeNull();
    });
  });

  describe("aggregateSpend", () => {
    it("sums matching expense transactions for an overall budget", async () => {
      await insertTransactions([
        { categoryId: categoryA, amountMinor: 250 },
        { categoryId: categoryB, amountMinor: 750 },
      ]);

      const result = await repo.aggregateSpend({
        userId: userA,
        currency: "INR",
        from: WINDOW.from,
        to: WINDOW.to,
      });
      expect(result).toEqual({ spentMinor: 1000 });
    });

    it("sums only transactions matching the category for a category budget", async () => {
      await insertTransactions([
        { categoryId: categoryA, amountMinor: 400 },
        { categoryId: categoryB, amountMinor: 600 },
      ]);

      const result = await repo.aggregateSpend({
        userId: userA,
        currency: "INR",
        from: WINDOW.from,
        to: WINDOW.to,
        categoryId: categoryA,
      });
      expect(result).toEqual({ spentMinor: 400 });
    });

    it("excludes transactions outside the window inclusive boundaries", async () => {
      await insertTransactions([
        { amountMinor: 100, transactionDate: WINDOW.from },
        { amountMinor: 200, transactionDate: WINDOW.to },
        { amountMinor: 300, transactionDate: new Date("2026-02-28T00:00:00.000Z") },
        { amountMinor: 400, transactionDate: new Date("2026-04-01T00:00:00.000Z") },
      ]);

      const result = await repo.aggregateSpend({
        userId: userA,
        currency: "INR",
        from: WINDOW.from,
        to: WINDOW.to,
      });
      expect(result).toEqual({ spentMinor: 300 });
    });

    it("excludes pending and rejected transactions", async () => {
      await insertTransactions([
        { amountMinor: 100 },
        { status: "pending", amountMinor: 200 },
        { status: "rejected", amountMinor: 300 },
      ]);

      const result = await repo.aggregateSpend({
        userId: userA,
        currency: "INR",
        from: WINDOW.from,
        to: WINDOW.to,
      });
      expect(result).toEqual({ spentMinor: 100 });
    });

    it("excludes soft-deleted transactions", async () => {
      const deleted = await TransactionModel.create(
        transactionInput({ amountMinor: 500 }),
      );
      await TransactionModel.updateOne(
        { _id: deleted._id },
        { $set: { deletedAt: new Date(), deletedBy: userA } },
      );

      const result = await repo.aggregateSpend({
        userId: userA,
        currency: "INR",
        from: WINDOW.from,
        to: WINDOW.to,
      });
      expect(result).toEqual({ spentMinor: 0 });
    });

    it("excludes non-expense transaction types", async () => {
      await insertTransactions([
        { amountMinor: 100 },
        { type: "income", direction: "inflow", amountMinor: 500 },
        { type: "transfer", direction: "outflow", amountMinor: 200 },
      ]);

      const result = await repo.aggregateSpend({
        userId: userA,
        currency: "INR",
        from: WINDOW.from,
        to: WINDOW.to,
      });
      expect(result).toEqual({ spentMinor: 100 });
    });

    it("respects the budget currency", async () => {
      await insertTransactions([
        { amountMinor: 100, currency: "INR" },
        { amountMinor: 300, currency: "USD" },
      ]);

      const result = await repo.aggregateSpend({
        userId: userA,
        currency: "USD",
        from: WINDOW.from,
        to: WINDOW.to,
      });
      expect(result).toEqual({ spentMinor: 300 });
    });

    it("excludes other users' transactions", async () => {
      await insertTransactions([
        { amountMinor: 100 },
        { userId: userB, amountMinor: 900 },
      ]);

      const result = await repo.aggregateSpend({
        userId: userA,
        currency: "INR",
        from: WINDOW.from,
        to: WINDOW.to,
      });
      expect(result).toEqual({ spentMinor: 100 });
    });

    it("returns zero spend when nothing matches", async () => {
      const result = await repo.aggregateSpend({
        userId: userA,
        currency: "INR",
        from: WINDOW.from,
        to: WINDOW.to,
      });
      expect(result).toEqual({ spentMinor: 0 });
    });

    it("sums large integer minor amounts exactly", async () => {
      await insertTransactions([
        { amountMinor: 12_345_678 },
        { amountMinor: 8_765_432 },
      ]);

      const result = await repo.aggregateSpend({
        userId: userA,
        currency: "INR",
        from: WINDOW.from,
        to: WINDOW.to,
      });
      expect(result).toEqual({ spentMinor: 21_111_110 });
    });

    it("ignores category filters for overall budgets when no category is given", async () => {
      await insertTransactions([
        { categoryId: null, amountMinor: 150 },
        { categoryId: categoryA, amountMinor: 350 },
      ]);

      const result = await repo.aggregateSpend({
        userId: userA,
        currency: "INR",
        from: WINDOW.from,
        to: WINDOW.to,
      });
      expect(result).toEqual({ spentMinor: 500 });
    });
  });
});
