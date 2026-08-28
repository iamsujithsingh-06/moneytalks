import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import {
  clearDatabase,
  closeDatabase,
  createAccountRateLimiter,
  createTestApp,
  type TestApp,
} from "./helpers/test-app.js";
import { syncDbIndexes } from "../src/db/index.js";
import type { SlidingWindowRateLimiter } from "../src/lib/rate-limiter.js";

const PASSWORD = "CorrectHorseBattery1";

function withAuth(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

function txBody(overrides: Record<string, unknown> = {}) {
  return {
    clientId: randomUUID(),
    type: "expense",
    amountMinor: 1200,
    currency: "INR",
    transactionDate: currentDay(1),
    ...overrides,
  };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}`;
}

function currentDay(day: number): string {
  return `${currentMonth()}-${pad(day)}`;
}

describe("Dashboard API", () => {
  let app: TestApp["app"];
  let logger: TestApp["logger"];
  let accountRateLimiter: SlidingWindowRateLimiter;

  beforeAll(async () => {
    accountRateLimiter = createAccountRateLimiter(50);
    const ctx = await createTestApp({}, { accountRateLimiter });
    app = ctx.app;
    logger = ctx.logger;
  });

  beforeEach(async () => {
    await clearDatabase();
    await syncDbIndexes(logger);
    accountRateLimiter.resetAll();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  async function registerAndLogin(email: string) {
    await request(app)
      .post("/api/v1/auth/register")
      .send({ email, password: PASSWORD })
      .expect(201);
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email,
        password: PASSWORD,
        device: { name: "dashboard-test", platform: "web" },
      })
      .expect(200);
    return {
      accessToken: res.body.data.accessToken as string,
      userId: res.body.data.user.id as string,
    };
  }

  async function createCategory(accessToken: string, type: string, base: string) {
    const name = `${base} ${randomUUID().slice(0, 8)}`;
    const res = await request(app)
      .post("/api/v1/categories")
      .set(withAuth(accessToken))
      .send({ clientId: randomUUID(), name, type })
      .expect(201);
    return res.body.data as { id: string; name: string; [key: string]: unknown };
  }

  async function createTx(
    accessToken: string,
    overrides: Record<string, unknown> = {},
  ) {
    const res = await request(app)
      .post("/api/v1/transactions")
      .set(withAuth(accessToken))
      .send(txBody(overrides))
      .expect(201);
    return res.body.data as { id: string; [key: string]: unknown };
  }

  async function createBudget(accessToken: string, categoryId: string) {
    await request(app)
      .post("/api/v1/budgets")
      .set(withAuth(accessToken))
      .send({
        clientId: randomUUID(),
        scope: "category",
        categoryId,
        period: "monthly",
        allocatedMinor: 10_000,
        currency: "INR",
      })
      .expect(201);
  }

  it("rejects requests without a token", async () => {
    const res = await request(app).get("/api/v1/dashboard/summary");
    expect(res.status).toBe(401);
  });

  it("returns zeros and empty collections for a fresh user", async () => {
    const { accessToken } = await registerAndLogin("dash-empty@example.com");
    const res = await request(app)
      .get("/api/v1/dashboard/summary")
      .set(withAuth(accessToken))
      .expect(200);

    expect(res.body.data).toMatchObject({
      balance: 0,
      monthIncome: 0,
      monthExpense: 0,
      net: 0,
      topCategories: [],
      recent: [],
      budgets: [],
      goals: [],
      insights: [],
    });
  });

  it("composes balance, monthly figures, top categories, recent and budgets", async () => {
    const { accessToken } = await registerAndLogin("dash@example.com");
    const food = await createCategory(accessToken, "expense", "Food");
    const travel = await createCategory(accessToken, "expense", "Travel");
    await createCategory(accessToken, "income", "Salary");

    // All-time balance includes months beyond the current one.
    await createTx(accessToken, { type: "income", amountMinor: 50_000, transactionDate: "2026-01-05" });
    await createTx(accessToken, { type: "expense", amountMinor: 5000, categoryId: food.id, merchant: "Cafe", transactionDate: currentDay(6) });
    await createTx(accessToken, { type: "expense", amountMinor: 3000, categoryId: travel.id, merchant: "Cab", transactionDate: currentDay(7) });
    await createTx(accessToken, { type: "expense", amountMinor: 2000, categoryId: food.id, merchant: "Market", transactionDate: currentDay(8) });
    await createBudget(accessToken, food.id);

    const res = await request(app)
      .get("/api/v1/dashboard/summary")
      .set(withAuth(accessToken))
      .expect(200);

    const data = res.body.data;
    expect(data.balance).toBe(40_000); // 50000 income - 10000 expense
    expect(data.monthIncome).toBe(0);
    expect(data.monthExpense).toBe(10_000);
    expect(data.net).toBe(-10_000);
    expect(data.topCategories).toEqual([
      { categoryId: food.id, name: food.name, totalMinor: 7000 },
      { categoryId: travel.id, name: travel.name, totalMinor: 3000 },
    ]);
    expect(data.recent).toHaveLength(4);
    expect(data.budgets).toHaveLength(1);
    expect(data.budgets[0]).toMatchObject({
      scope: "category",
      categoryId: food.id,
      allocatedMinor: 10_000,
      spentMinor: 7000,
    });
    expect(data.goals).toEqual([]);
    expect(data.insights).toEqual([]);
  });
});
