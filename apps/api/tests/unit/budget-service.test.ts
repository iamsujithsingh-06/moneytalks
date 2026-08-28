import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import {
  BudgetPeriod,
  BudgetScope,
  BudgetStatus,
} from "@moneytalks/shared";
import type {
  CreateBudgetData,
  UpdateBudgetData,
} from "@moneytalks/types";
import { ErrorCodes } from "../../src/lib/errors.js";
import type { AppLogger } from "../../src/lib/logger.js";
import {
  BudgetService,
  type BudgetContext,
} from "../../src/modules/budgets/service.js";
import type {
  BudgetRecord,
  BudgetRepository,
} from "../../src/modules/budgets/repository.js";

const logger = {} as AppLogger;

const ctx: BudgetContext = { userId: "user-a" };
const CATEGORY_A = "64d8b2c0f1a2b3c4d5e6f001";

function budgetInput(
  overrides: Partial<CreateBudgetData> = {},
): CreateBudgetData {
  return {
    clientId: randomUUID(),
    scope: BudgetScope.Category,
    categoryId: CATEGORY_A,
    period: BudgetPeriod.Monthly,
    allocatedMinor: 10_000,
    currency: "INR",
    rollover: false,
    status: BudgetStatus.Active,
    alertThresholds: { warningPct: 80, hardPct: 100 },
    ...overrides,
  };
}

function overallInput(overrides: Partial<CreateBudgetData> = {}) {
  return budgetInput({
    scope: BudgetScope.Overall,
    categoryId: undefined,
    ...overrides,
  });
}

function updateInput(overrides: Partial<UpdateBudgetData> = {}) {
  return { allocatedMinor: 20_000, ...overrides };
}

function makeRecord(overrides: Partial<BudgetRecord> = {}): BudgetRecord {
  return {
    id: randomUUID(),
    userId: "user-a",
    clientId: randomUUID(),
    categoryId: CATEGORY_A,
    scope: BudgetScope.Category,
    period: BudgetPeriod.Monthly,
    periodAnchor: null,
    allocatedMinor: 10_000,
    currency: "INR",
    rollover: false,
    status: BudgetStatus.Active,
    alertThresholds: { warningPct: 80, hardPct: 100 },
    deletedAt: null,
    deletedBy: null,
    rev: 0,
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    updatedAt: new Date("2026-03-01T00:00:00.000Z"),
    ...overrides,
  };
}

function categoryString(value: Types.ObjectId | string | null | undefined): string | null {
  return value == null ? null : value.toString();
}

function makeRepo(overrides: Partial<BudgetRepository> = {}): BudgetRepository {
  return {
    create: async (input) => makeRecord({ period: input.period }),
    findById: async () => null,
    findActiveById: async () => null,
    listByUser: async () => [],
    findActiveDuplicate: async () => null,
    update: async (_u, id) => makeRecord({ id: id.toString() }),
    softDelete: async () => null,
    aggregateSpend: async (_input) => ({ spentMinor: 0 }),
    ...overrides,
  };
}

describe("BudgetService.create", () => {
  it("creates a budget and returns its public shape with computed spend", async () => {
    const repo = makeRepo({
      create: async (input) =>
        makeRecord({
          period: input.period,
          scope: input.scope,
          categoryId: categoryString(input.categoryId),
          allocatedMinor: input.allocatedMinor,
          status: input.status ?? BudgetStatus.Active,
        }),
      aggregateSpend: async () => ({ spentMinor: 2_500 }),
    });
    const service = new BudgetService({ logger, repository: repo });

    const result = await service.create(budgetInput(), ctx);

    expect(result).toMatchObject({
      userId: "user-a",
      categoryId: CATEGORY_A,
      scope: "category",
      period: "monthly",
      allocatedMinor: 10_000,
      spentMinor: 2_500,
      percent: 25,
      alertStatus: "ok",
      deleted: false,
    });
    expect(result.createdAt).toBeTruthy();
  });

  it("throws BudgetExists 409 when an active duplicate exists", async () => {
    const repo = makeRepo({
      findActiveDuplicate: async () => makeRecord(),
    });
    const service = new BudgetService({ logger, repository: repo });

    await expect(service.create(budgetInput(), ctx)).rejects.toMatchObject({
      statusCode: 409,
      code: ErrorCodes.BudgetExists,
    });
  });

  it("converts a raced E11000 into BudgetExists 409 when a survivor exists", async () => {
    const repo = makeRepo({
      create: async () => {
        throw Object.assign(new Error("duplicate key"), { code: 11000 });
      },
      findActiveDuplicate: async () => makeRecord(),
    });
    const service = new BudgetService({ logger, repository: repo });

    await expect(service.create(budgetInput(), ctx)).rejects.toMatchObject({
      statusCode: 409,
      code: ErrorCodes.BudgetExists,
    });
  });

  it("does not leak a raw Mongo error when no survivor exists", async () => {
    const repo = makeRepo({
      create: async () => {
        throw Object.assign(new Error("duplicate key"), { code: 11000 });
      },
    });
    const service = new BudgetService({ logger, repository: repo });

    await expect(service.create(budgetInput(), ctx)).rejects.toMatchObject({
      statusCode: 500,
      code: ErrorCodes.Internal,
    });
  });

  it("passes an overall budget without a categoryId", async () => {
    let sentCategory: Types.ObjectId | string | null | undefined = undefined;
    const repo = makeRepo({
      create: async (input) => {
        sentCategory = input.categoryId ?? null;
        return makeRecord({ scope: input.scope, categoryId: categoryString(input.categoryId) });
      },
    });
    const service = new BudgetService({ logger, repository: repo });

    await service.create(overallInput(), ctx);
    expect(sentCategory).toBeNull();
  });

  it("scopes the created budget to the authenticated user", async () => {
    let sentUser: string | Types.ObjectId | undefined;
    const repo = makeRepo({
      create: async (input) => {
        sentUser = input.userId;
        return makeRecord();
      },
    });
    const service = new BudgetService({ logger, repository: repo });

    await service.create(budgetInput(), { userId: "scoped-user" });
    expect(sentUser?.toString()).toBe("scoped-user");
  });
});

describe("BudgetService.list", () => {
  it("lists budgets and enriches each with spend, percent, and alert status", async () => {
    const repo = makeRepo({
      listByUser: async (_u, filter) => [
        makeRecord({ id: "b1", period: filter?.period ?? "monthly", scope: BudgetScope.Overall, categoryId: null }),
        makeRecord({ id: "b2", period: "monthly" }),
      ],
      aggregateSpend: async () => ({ spentMinor: 0 }),
    });
    const service = new BudgetService({ logger, repository: repo });

    const result = await service.list("user-a", { period: "monthly" });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: "b1", spentMinor: 0, percent: 0, alertStatus: "ok" });
    expect(result[1]).toMatchObject({ id: "b2", scope: "category", categoryId: CATEGORY_A });
  });

  it("reports warning alert status at the warning threshold", async () => {
    const repo = makeRepo({
      listByUser: async () => [makeRecord({ id: "b1", allocatedMinor: 100, alertThresholds: { warningPct: 80, hardPct: 100 } })],
      aggregateSpend: async () => ({ spentMinor: 90 }),
    });
    const service = new BudgetService({ logger, repository: repo });

    const [result] = await service.list("user-a", {});
    expect(result).toMatchObject({ percent: 90, alertStatus: "warning" });
  });

  it("reports over alert status when spend meets the hard threshold", async () => {
    const repo = makeRepo({
      listByUser: async () => [makeRecord({ id: "b1", allocatedMinor: 100, alertThresholds: { warningPct: 80, hardPct: 100 } })],
      aggregateSpend: async () => ({ spentMinor: 120 }),
    });
    const service = new BudgetService({ logger, repository: repo });

    const [result] = await service.list("user-a", {});
    expect(result).toMatchObject({ percent: 120, alertStatus: "over" });
  });
});

describe("BudgetService.findById", () => {
  it("returns the enrichened budget when it exists", async () => {
    const repo = makeRepo({
      findActiveById: async () => makeRecord({ id: "b1" }),
      aggregateSpend: async () => ({ spentMinor: 5_000 }),
    });
    const service = new BudgetService({ logger, repository: repo });

    const result = await service.findById("user-a", "b1");
    expect(result).toMatchObject({ id: "b1", spentMinor: 5_000, percent: 50 });
  });

  it("returns null when the budget does not exist", async () => {
    const repo = makeRepo({ findActiveById: async () => null });
    const service = new BudgetService({ logger, repository: repo });

    expect(await service.findById("user-a", "missing")).toBeNull();
  });
});

describe("BudgetService.update", () => {
  it("updates a budget and returns the enrichened public record", async () => {
    const repo = makeRepo({
      findActiveById: async () => makeRecord({ id: "b1" }),
      findActiveDuplicate: async () => null,
      update: async (_u, id) => makeRecord({ id: id.toString(), allocatedMinor: 20_000 }),
      aggregateSpend: async () => ({ spentMinor: 4_000 }),
    });
    const service = new BudgetService({ logger, repository: repo });

    const result = await service.update("user-a", "b1", updateInput());

    expect(result).toMatchObject({ id: "b1", allocatedMinor: 20_000, percent: 20 });
  });

  it("throws 404 when the budget does not exist", async () => {
    const repo = makeRepo({ findActiveById: async () => null });
    const service = new BudgetService({ logger, repository: repo });

    await expect(
      service.update("user-a", "missing", updateInput()),
    ).rejects.toMatchObject({ statusCode: 404, code: ErrorCodes.NotFound });
  });

  it("throws BudgetExists 409 when updating into a conflicting duplicate", async () => {
    const repo = makeRepo({
      findActiveById: async () => makeRecord({ id: "b1", period: "weekly" }),
      findActiveDuplicate: async () => makeRecord({ id: "b2" }),
    });
    const service = new BudgetService({ logger, repository: repo });

    await expect(
      service.update("user-a", "b1", updateInput({ period: "monthly" })),
    ).rejects.toMatchObject({ statusCode: 409, code: ErrorCodes.BudgetExists });
  });

  it("ignores the self-match when a duplicate is the same budget", async () => {
    const repo = makeRepo({
      findActiveById: async () => makeRecord({ id: "b1" }),
      findActiveDuplicate: async () => makeRecord({ id: "b1" }),
      update: async (_u, id) => makeRecord({ id: id.toString() }),
      aggregateSpend: async () => ({ spentMinor: 0 }),
    });
    const service = new BudgetService({ logger, repository: repo });

    const result = await service.update("user-a", "b1", updateInput());
    expect(result.id).toBe("b1");
  });

  it("converts a raced E11000 into BudgetExists when another budget survives", async () => {
    const repo = makeRepo({
      findActiveById: async () => makeRecord({ id: "b1", period: "weekly" }),
      findActiveDuplicate: async () => makeRecord({ id: "b2" }),
      update: async () => {
        throw Object.assign(new Error("duplicate key"), { code: 11000 });
      },
    });
    const service = new BudgetService({ logger, repository: repo });

    await expect(
      service.update("user-a", "b1", updateInput({ period: "monthly" })),
    ).rejects.toMatchObject({ statusCode: 409, code: ErrorCodes.BudgetExists });
  });
});

describe("BudgetService.softDelete", () => {
  it("soft-deletes an active budget", async () => {
    let deleted = false;
    const repo = makeRepo({
      findById: async () => makeRecord({ id: "b1" }),
      softDelete: async () => {
        deleted = true;
        return makeRecord({ id: "b1", deletedAt: new Date() });
      },
    });
    const service = new BudgetService({ logger, repository: repo });

    await service.softDelete("user-a", "b1", "user-a");
    expect(deleted).toBe(true);
  });

  it("is a no-op when the budget is already deleted", async () => {
    let calls = 0;
    const repo = makeRepo({
      findById: async () => makeRecord({ id: "b1", deletedAt: new Date() }),
      softDelete: async () => {
        calls++;
        return null;
      },
    });
    const service = new BudgetService({ logger, repository: repo });

    await service.softDelete("user-a", "b1", "user-a");
    expect(calls).toBe(0);
  });

  it("throws 404 when the budget does not exist", async () => {
    const repo = makeRepo({ findById: async () => null });
    const service = new BudgetService({ logger, repository: repo });

    await expect(
      service.softDelete("user-a", "missing", "user-a"),
    ).rejects.toMatchObject({ statusCode: 404, code: ErrorCodes.NotFound });
  });
});

describe("BudgetService.spend window per period", () => {
  it("aggregates spend using the category for category budgets", async () => {
    let sent: Types.ObjectId | string | null | undefined;
    const repo = makeRepo({
      aggregateSpend: async (input) => {
        sent = input.categoryId ?? null;
        return { spentMinor: 0 };
      },
      listByUser: async () => [makeRecord({ id: "b1", scope: BudgetScope.Category, categoryId: CATEGORY_A })],
    });
    const service = new BudgetService({ logger, repository: repo });

    await service.list("user-a", {});
    expect(sent?.toString()).toBe(CATEGORY_A);
  });

  it("aggregates spend without a category for overall budgets", async () => {
    let sent: Types.ObjectId | string | null | undefined;
    const repo = makeRepo({
      aggregateSpend: async (input) => {
        sent = input.categoryId ?? null;
        return { spentMinor: 0 };
      },
      listByUser: async () => [makeRecord({ id: "b1", scope: BudgetScope.Overall, categoryId: null })],
    });
    const service = new BudgetService({ logger, repository: repo });

    await service.list("user-a", {});
    expect(sent).toBeNull();
  });
});
