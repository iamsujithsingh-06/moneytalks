import { describe, expect, it } from "vitest";
import { AnalyticsGranularity } from "@moneytalks/shared";
import type { AppLogger } from "../../src/lib/logger.js";
import {
  AnalyticsService,
  type AnalyticsServiceDeps,
} from "../../src/modules/analytics/service.js";
import type {
  AnalyticsRepository,
  AnalyticsTransaction,
} from "../../src/modules/analytics/repository.js";
import type { CategoryRepository, CategoryRecord } from "../../src/modules/categories/repository.js";

const logger = {} as AppLogger;
const USER = "user-a";
const CATEGORY_A = "64d8b2c0f1a2b3c4d5e6f001";
const CATEGORY_B = "64d8b2c0f1a2b3c4d5e6f002";
const CATEGORY_INC = "64d8b2c0f1a2b3c4d5e6f003";

function txn(overrides: Partial<AnalyticsTransaction> = {}): AnalyticsTransaction {
  return {
    type: "expense",
    direction: "outflow",
    amountMinor: 0,
    categoryId: null,
    transactionDate: new Date("2026-03-10T00:00:00.000Z"),
    merchant: null,
    ...overrides,
  };
}

function categoryRecord(
  id: string,
  name: string,
  type: string,
): CategoryRecord {
  return {
    id,
    userId: USER,
    clientId: "00000000-0000-4000-8000-000000000001",
    name,
    type,
    icon: null,
    color: null,
    parentId: null,
    sortOrder: 0,
    isPreset: false,
    isDefault: false,
    status: "active",
    deletedAt: null,
    deletedBy: null,
    rev: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function makeRepo(
  overrides: Partial<AnalyticsRepository> = {},
): AnalyticsRepository {
  return {
    fetchInWindow: async () => [],
    balance: async () => 0,
    ...overrides,
  };
}

function makeCategoryRepo(
  records: CategoryRecord[],
): CategoryRepository {
  return {
    create: async () => records[0] as CategoryRecord,
    findById: async () => null,
    findActiveById: async () => null,
    findByClientId: async () => null,
    findByNameAndType: async () => null,
    findDefaultByType: async () => null,
    listByUser: async () => records,
    maxSortOrder: async () => 0,
    update: async () => null,
    softDelete: async () => null,
    resetDefaults: async () => {},
    clearParent: async () => {},
  };
}

function makeService(deps: Partial<AnalyticsServiceDeps> = {}): AnalyticsService {
  return new AnalyticsService({
    logger,
    repository: makeRepo(),
    categoryRepository: makeCategoryRepo([]),
    ...deps,
  });
}

describe("AnalyticsService", () => {
  it("computes summary income, expense, cashFlow and trend buckets", async () => {
    const service = makeService({
      repository: makeRepo({
        fetchInWindow: async () => [
          txn({ type: "income", direction: "inflow", amountMinor: 1000, categoryId: CATEGORY_INC, transactionDate: new Date("2026-03-05T00:00:00.000Z") }),
          txn({ type: "expense", direction: "outflow", amountMinor: 400, categoryId: CATEGORY_A, merchant: "Cafe", transactionDate: new Date("2026-03-10T00:00:00.000Z") }),
          txn({ type: "expense", direction: "outflow", amountMinor: 200, categoryId: CATEGORY_B, merchant: "Cab", transactionDate: new Date("2026-03-20T00:00:00.000Z") }),
        ],
      }),
      categoryRepository: makeCategoryRepo([
        categoryRecord(CATEGORY_A, "Food", "expense"),
        categoryRecord(CATEGORY_B, "Travel", "expense"),
        categoryRecord(CATEGORY_INC, "Salary", "income"),
      ]),
    });

    const result = await service.summary(USER, {
      from: "2026-03-01",
      to: "2026-03-31",
      granularity: AnalyticsGranularity.Monthly,
    });

    expect(result.income).toBe(1000);
    expect(result.expense).toBe(600);
    expect(result.cashFlow).toBe(400);
    expect(result.trend).toEqual([
      { period: "2026-03", income: 1000, expense: 600, net: 400 },
    ]);
    expect(result.topMerchants).toEqual([
      { merchant: "Cafe", totalMinor: 400, count: 1 },
      { merchant: "Cab", totalMinor: 200, count: 1 },
    ]);
    expect(result.anomalies).toEqual([]);
  });

  it("excludes transfer and adjustment types from income/expense", async () => {
    const service = makeService({
      repository: makeRepo({
        fetchInWindow: async () => [
          txn({ type: "income", direction: "inflow", amountMinor: 500, transactionDate: new Date("2026-03-05T00:00:00.000Z") }),
          txn({ type: "transfer", direction: "inflow", amountMinor: 90_000, transactionDate: new Date("2026-03-06T00:00:00.000Z") }),
          txn({ type: "adjustment", direction: "outflow", amountMinor: 50, transactionDate: new Date("2026-03-07T00:00:00.000Z") }),
        ],
      }),
    });

    const result = await service.summary(USER, {
      from: "2026-03-01",
      to: "2026-03-31",
      granularity: AnalyticsGranularity.Monthly,
    });

    expect(result.income).toBe(500);
    expect(result.expense).toBe(0);
    expect(result.cashFlow).toBe(500);
  });

  it("fills empty daily buckets in the cash-flow series in order", async () => {
    const service = makeService({
      repository: makeRepo({
        fetchInWindow: async () => [
          txn({ type: "expense", direction: "outflow", amountMinor: 100, transactionDate: new Date("2026-03-01T12:00:00.000Z") }),
          txn({ type: "income", direction: "inflow", amountMinor: 50, transactionDate: new Date("2026-03-03T08:00:00.000Z") }),
        ],
      }),
    });

    const series = await service.cashFlow(USER, {
      from: "2026-03-01",
      to: "2026-03-03",
      granularity: AnalyticsGranularity.Daily,
    });

    expect(series.series).toEqual([
      { period: "2026-03-01", income: 0, expense: 100, net: -100 },
      { period: "2026-03-02", income: 0, expense: 0, net: 0 },
      { period: "2026-03-03", income: 50, expense: 0, net: 50 },
    ]);
  });

  it("categories endpoint filters by type and sorts by spend descending", async () => {
    const service = makeService({
      repository: makeRepo({
        fetchInWindow: async () => [
          txn({ amountMinor: 300, categoryId: CATEGORY_A, transactionDate: new Date("2026-03-10T00:00:00.000Z") }),
          txn({ amountMinor: 700, categoryId: CATEGORY_B, transactionDate: new Date("2026-03-11T00:00:00.000Z") }),
          txn({ type: "income", direction: "inflow", amountMinor: 900, categoryId: CATEGORY_INC, transactionDate: new Date("2026-03-12T00:00:00.000Z") }),
        ],
      }),
      categoryRepository: makeCategoryRepo([
        categoryRecord(CATEGORY_A, "Food", "expense"),
        categoryRecord(CATEGORY_B, "Travel", "expense"),
        categoryRecord(CATEGORY_INC, "Salary", "income"),
      ]),
    });

    const { items } = await service.categories(USER, {
      from: "2026-03-01",
      to: "2026-03-31",
      type: "expense",
    });

    expect(items).toEqual([
      { categoryId: CATEGORY_B, name: "Travel", type: "expense", totalMinor: 700, count: 1 },
      { categoryId: CATEGORY_A, name: "Food", type: "expense", totalMinor: 300, count: 1 },
    ]);
  });

  it("topCategories returns the top expense categories with names", async () => {
    const service = makeService({
      repository: makeRepo({
        fetchInWindow: async () => [
          txn({ amountMinor: 300, categoryId: CATEGORY_A, transactionDate: new Date("2026-03-10T00:00:00.000Z") }),
          txn({ amountMinor: 700, categoryId: CATEGORY_B, transactionDate: new Date("2026-03-11T00:00:00.000Z") }),
          txn({ type: "income", direction: "inflow", amountMinor: 900, categoryId: CATEGORY_INC, transactionDate: new Date("2026-03-12T00:00:00.000Z") }),
        ],
      }),
      categoryRepository: makeCategoryRepo([
        categoryRecord(CATEGORY_A, "Food", "expense"),
        categoryRecord(CATEGORY_B, "Travel", "expense"),
        categoryRecord(CATEGORY_INC, "Salary", "income"),
      ]),
    });

    const top = await service.topCategories(USER, "2026-03-01", "2026-03-31", 5);
    expect(top).toEqual([
      { categoryId: CATEGORY_B, name: "Travel", totalMinor: 700 },
      { categoryId: CATEGORY_A, name: "Food", totalMinor: 300 },
    ]);
  });

  it("balance delegates to the repository", async () => {
    const service = makeService({
      repository: makeRepo({ balance: async () => 12_345 }),
    });
    expect(await service.balance(USER)).toBe(12_345);
  });
});
