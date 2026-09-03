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
    transactionDate: "2026-03-15",
    ...overrides,
  };
}

describe("Analytics API", () => {
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
        device: { name: "analytics-test", platform: "web" },
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
    await request(app)
      .post("/api/v1/transactions")
      .set(withAuth(accessToken))
      .send(txBody(overrides))
      .expect(201);
  }

  describe("authentication", () => {
    it("rejects requests without a token", async () => {
      const summary = await request(app).get("/api/v1/analytics/summary");
      expect(summary.status).toBe(401);

      const cashflow = await request(app).get("/api/v1/analytics/cashflow");
      expect(cashflow.status).toBe(401);

      const categories = await request(app).get("/api/v1/analytics/categories");
      expect(categories.status).toBe(401);
    });
  });

  it("returns an empty summary for a user with no transactions", async () => {
    const { accessToken } = await registerAndLogin("ana-empty@example.com");
    const res = await request(app)
      .get("/api/v1/analytics/summary?from=2026-03-01&to=2026-03-31&granularity=monthly")
      .set(withAuth(accessToken))
      .expect(200);
    expect(res.body.data).toEqual({
      income: 0,
      expense: 0,
      cashFlow: 0,
      categoryBreakdown: [],
      trend: [{ period: "2026-03", income: 0, expense: 0, net: 0 }],
      topMerchants: [],
      anomalies: [],
    });
  });

  it("computes summary figures with category breakdown and top merchants", async () => {
    const { accessToken } = await registerAndLogin("ana-summary@example.com");
    const food = await createCategory(accessToken, "expense", "Food");
    const travel = await createCategory(accessToken, "expense", "Travel");
    await createCategory(accessToken, "income", "Salary");

    await createTx(accessToken, { type: "income", amountMinor: 10_000, transactionDate: "2026-03-05" });
    await createTx(accessToken, { type: "expense", amountMinor: 4000, categoryId: food.id, merchant: "Cafe", transactionDate: "2026-03-10" });
    await createTx(accessToken, { type: "expense", amountMinor: 2000, categoryId: travel.id, merchant: "Cab", transactionDate: "2026-03-20" });
    await createTx(accessToken, { type: "expense", amountMinor: 800, merchant: "Cafe", transactionDate: "2026-03-21" });

    const res = await request(app)
      .get("/api/v1/analytics/summary?from=2026-03-01&to=2026-03-31&granularity=monthly")
      .set(withAuth(accessToken))
      .expect(200);

    const data = res.body.data;
    expect(data.income).toBe(10_000);
    expect(data.expense).toBe(6800);
    expect(data.cashFlow).toBe(3200);
    expect(data.trend).toEqual([
      { period: "2026-03", income: 10_000, expense: 6800, net: 3200 },
    ]);
    expect(data.topMerchants).toEqual([
      { merchant: "Cafe", totalMinor: 4800, count: 2 },
      { merchant: "Cab", totalMinor: 2000, count: 1 },
    ]);
    const sorted = [...data.categoryBreakdown].sort(
      (a: { totalMinor: number }, b: { totalMinor: number }) => b.totalMinor - a.totalMinor,
    );
    expect(sorted).toEqual([
      { categoryId: null, name: "Uncategorized", type: "expense", totalMinor: 10800, count: 2 },
      { categoryId: food.id, name: food.name, type: "expense", totalMinor: 4000, count: 1 },
      { categoryId: travel.id, name: travel.name, type: "expense", totalMinor: 2000, count: 1 },
    ]);
  });

  it("cashflow returns a daily bucketed series", async () => {
    const { accessToken } = await registerAndLogin("ana-flow@example.com");
    await createTx(accessToken, { type: "expense", amountMinor: 100, transactionDate: "2026-03-01" });
    await createTx(accessToken, { type: "income", amountMinor: 50, transactionDate: "2026-03-03" });

    const res = await request(app)
      .get("/api/v1/analytics/cashflow?from=2026-03-01&to=2026-03-03&granularity=daily")
      .set(withAuth(accessToken))
      .expect(200);

    expect(res.body.data.series).toEqual([
      { period: "2026-03-01", income: 0, expense: 100, net: -100 },
      { period: "2026-03-02", income: 0, expense: 0, net: 0 },
      { period: "2026-03-03", income: 50, expense: 0, net: 50 },
    ]);
  });

  it("categories returns breakdown filtered by type", async () => {
    const { accessToken } = await registerAndLogin("ana-cat@example.com");
    const food = await createCategory(accessToken, "expense", "Food");
    const salary = await createCategory(accessToken, "income", "Salary");

    await createTx(accessToken, { type: "expense", amountMinor: 300, categoryId: food.id, transactionDate: "2026-03-10" });
    await createTx(accessToken, { type: "income", amountMinor: 900, categoryId: salary.id, transactionDate: "2026-03-11" });

    const res = await request(app)
      .get("/api/v1/analytics/categories?from=2026-03-01&to=2026-03-31&type=income")
      .set(withAuth(accessToken))
      .expect(200);

    expect(res.body.data.items).toEqual([
      { categoryId: salary.id, name: salary.name, type: "income", totalMinor: 900, count: 1 },
    ]);
  });

  it("scope is isolated between users", async () => {
    const alice = await registerAndLogin("ana-a@example.com");
    const bob = await registerAndLogin("ana-b@example.com");
    await createTx(alice.accessToken, { type: "expense", amountMinor: 5000, transactionDate: "2026-03-10" });

    const res = await request(app)
      .get("/api/v1/analytics/summary?from=2026-03-01&to=2026-03-31")
      .set(withAuth(bob.accessToken))
      .expect(200);

    expect(res.body.data.expense).toBe(0);
  });

  it("rejects invalid query params with 422", async () => {
    const { accessToken } = await registerAndLogin("ana-invalid@example.com");
    const badGranularity = await request(app)
      .get("/api/v1/analytics/summary?granularity=yearly")
      .set(withAuth(accessToken));
    expect(badGranularity.status).toBe(422);

    const badRange = await request(app)
      .get("/api/v1/analytics/summary?from=2026-03-31&to=2026-03-01")
      .set(withAuth(accessToken));
    expect(badRange.status).toBe(422);
  });
});
