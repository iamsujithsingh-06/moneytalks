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

function categoryBudget(overrides: Record<string, unknown> = {}) {
  return {
    clientId: randomUUID(),
    scope: "category",
    period: "monthly",
    allocatedMinor: 10_000,
    currency: "INR",
    ...overrides,
  };
}

function overallBudget(overrides: Record<string, unknown> = {}) {
  return {
    clientId: randomUUID(),
    scope: "overall",
    period: "monthly",
    allocatedMinor: 10_000,
    currency: "INR",
    ...overrides,
  };
}

function txBody(overrides: Record<string, unknown> = {}) {
  return {
    clientId: randomUUID(),
    type: "expense",
    amountMinor: 1200,
    currency: "INR",
    transactionDate: new Date().toISOString().slice(0, 10),
    ...overrides,
  };
}

function withAuth(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

describe("Budgets API", () => {
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
        device: { name: "budget-test", platform: "web" },
      })
      .expect(200);
    return {
      accessToken: res.body.data.accessToken as string,
      userId: res.body.data.user.id as string,
    };
  }

  async function createCategory(accessToken: string) {
    const res = await request(app)
      .post("/api/v1/categories")
      .set(withAuth(accessToken))
      .send({
        clientId: randomUUID(),
        name: `Budget Cat ${randomUUID()}`,
        type: "expense",
      })
      .expect(201);
    return res.body.data as { id: string; [key: string]: unknown };
  }

  async function createBudget(
    accessToken: string,
    overrides: Record<string, unknown> = {},
  ) {
    const category = await createCategory(accessToken);
    const res = await request(app)
      .post("/api/v1/budgets")
      .set(withAuth(accessToken))
      .send(categoryBudget({ categoryId: category.id, ...overrides }))
      .expect(201);
    return res.body.data as { id: string; [key: string]: unknown };
  }

  describe("authentication", () => {
    it("rejects requests without a token", async () => {
      const get = await request(app).get("/api/v1/budgets");
      expect(get.status).toBe(401);
      expect(get.body.error.code).toBe("UNAUTHORIZED");

      const post = await request(app)
        .post("/api/v1/budgets")
        .send(categoryBudget());
      expect(post.status).toBe(401);

      const patch = await request(app)
        .patch("/api/v1/budgets/64d8b2c0f1a2b3c4d5e6f001")
        .send({ allocatedMinor: 5000 });
      expect(patch.status).toBe(401);

      const del = await request(app).delete(
        "/api/v1/budgets/64d8b2c0f1a2b3c4d5e6f001",
      );
      expect(del.status).toBe(401);
    });
  });

  describe("POST /api/v1/budgets", () => {
    it("creates a category budget with the public envelope", async () => {
      const { accessToken } = await registerAndLogin("bud1@example.com");
      const category = await createCategory(accessToken);
      const res = await request(app)
        .post("/api/v1/budgets")
        .set(withAuth(accessToken))
        .send(
          categoryBudget({
            categoryId: category.id,
            alertThresholds: { warningPct: 80, hardPct: 100 },
          }),
        );
      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeTruthy();
      expect(res.body.data.scope).toBe("category");
      expect(res.body.data.period).toBe("monthly");
      expect(res.body.data.categoryId).toBe(category.id);
      expect(res.body.data.allocatedMinor).toBe(10_000);
      expect(res.body.data.currency).toBe("INR");
      expect(res.body.data.status).toBe("active");
      expect(res.body.data.alertThresholds).toEqual({
        warningPct: 80,
        hardPct: 100,
      });
      expect(res.body.data.spentMinor).toBe(0);
      expect(res.body.data.percent).toBe(0);
      expect(res.body.data.alertStatus).toBe("ok");
      expect(res.body.data.deleted).toBe(false);
      expect(res.body.data.rev).toBe(0);
      expect(res.body.meta.requestId).toBeTruthy();
      expect(res.body.data).not.toHaveProperty("deletedAt");
      expect(res.body.data).not.toHaveProperty("deletedBy");
      expect(res.body.data).not.toHaveProperty("__v");
    });

    it("creates an overall budget without a categoryId", async () => {
      const { accessToken } = await registerAndLogin("bud2@example.com");
      const res = await request(app)
        .post("/api/v1/budgets")
        .set(withAuth(accessToken))
        .send(overallBudget());
      expect(res.status).toBe(201);
      expect(res.body.data.scope).toBe("overall");
      expect(res.body.data.categoryId).toBeNull();
    });

    it("rejects a duplicate active budget for the same period with 409", async () => {
      const { accessToken } = await registerAndLogin("bud3@example.com");
      const category = await createCategory(accessToken);
      const body = categoryBudget({ categoryId: category.id });
      await request(app)
        .post("/api/v1/budgets")
        .set(withAuth(accessToken))
        .send(body)
        .expect(201);
      const res = await request(app)
        .post("/api/v1/budgets")
        .set(withAuth(accessToken))
        .send(body);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("BUDGET_EXISTS");
    });

    it("rejects a category budget without a categoryId with 422", async () => {
      const { accessToken } = await registerAndLogin("bud4@example.com");
      const res = await request(app)
        .post("/api/v1/budgets")
        .set(withAuth(accessToken))
        .send(categoryBudget({ categoryId: undefined }));
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects an overall budget that provides a categoryId with 422", async () => {
      const { accessToken } = await registerAndLogin("bud5@example.com");
      const category = await createCategory(accessToken);
      const res = await request(app)
        .post("/api/v1/budgets")
        .set(withAuth(accessToken))
        .send(overallBudget({ categoryId: category.id }));
      expect(res.status).toBe(422);
    });

    it("rejects a custom budget without a periodAnchor with 422", async () => {
      const { accessToken } = await registerAndLogin("bud6@example.com");
      const res = await request(app)
        .post("/api/v1/budgets")
        .set(withAuth(accessToken))
        .send(categoryBudget({ period: "custom" }));
      expect(res.status).toBe(422);
    });

    it("rejects unknown fields with 422", async () => {
      const { accessToken } = await registerAndLogin("bud7@example.com");
      const category = await createCategory(accessToken);
      const res = await request(app)
        .post("/api/v1/budgets")
        .set(withAuth(accessToken))
        .send(categoryBudget({ categoryId: category.id, admin: true }));
      expect(res.status).toBe(422);
    });
  });

  describe("GET /api/v1/budgets", () => {
    it("returns the user's budgets and reports spend enrichment", async () => {
      const { accessToken } = await registerAndLogin("bud8@example.com");
      const category = await createCategory(accessToken);
      await createBudget(accessToken, { categoryId: category.id });

      await request(app)
        .post("/api/v1/transactions")
        .set(withAuth(accessToken))
        .send(txBody({ amountMinor: 5000, categoryId: category.id }))
        .expect(201);

      const res = await request(app)
        .get("/api/v1/budgets")
        .set(withAuth(accessToken));
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].spentMinor).toBe(5000);
      expect(res.body.data[0].percent).toBe(50);
      expect(res.body.data[0].alertStatus).toBe("ok");
    });

    it("filters by period", async () => {
      const { accessToken } = await registerAndLogin("bud9@example.com");
      await createBudget(accessToken, { period: "monthly" });
      await createBudget(accessToken, { period: "weekly" });

      const res = await request(app)
        .get("/api/v1/budgets")
        .set(withAuth(accessToken))
        .query({ period: "weekly" });
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].period).toBe("weekly");
    });

    it("does not return another user's budgets", async () => {
      const alice = await registerAndLogin("budA@example.com");
      await createBudget(alice.accessToken, { period: "monthly" });
      const bob = await registerAndLogin("budB@example.com");
      const res = await request(app)
        .get("/api/v1/budgets")
        .set(withAuth(bob.accessToken));
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });
  });

  describe("PATCH /api/v1/budgets/:id", () => {
    it("updates allowed fields and bumps rev", async () => {
      const { accessToken } = await registerAndLogin("budC@example.com");
      const budget = await createBudget(accessToken);
      const res = await request(app)
        .patch(`/api/v1/budgets/${budget.id}`)
        .set(withAuth(accessToken))
        .send({ allocatedMinor: 20_000, rollover: true });
      expect(res.status).toBe(200);
      expect(res.body.data.allocatedMinor).toBe(20_000);
      expect(res.body.data.rollover).toBe(true);
      expect(res.body.data.rev).toBe(1);
      expect(res.body.data.period).toBe("monthly");
    });

    it("rejects empty patches with 422", async () => {
      const { accessToken } = await registerAndLogin("budD@example.com");
      const budget = await createBudget(accessToken);
      const res = await request(app)
        .patch(`/api/v1/budgets/${budget.id}`)
        .set(withAuth(accessToken))
        .send({});
      expect(res.status).toBe(422);
    });

    it("rejects updating a non-existent budget with 404", async () => {
      const { accessToken } = await registerAndLogin("budE@example.com");
      const res = await request(app)
        .patch("/api/v1/budgets/64d8b2c0f1a2b3c4d5e6f001")
        .set(withAuth(accessToken))
        .send({ allocatedMinor: 5000 });
      expect(res.status).toBe(404);
    });

    it("rejects updating into a conflicting duplicate with 409", async () => {
      const { accessToken } = await registerAndLogin("budF@example.com");
      const category = await createCategory(accessToken);
      await request(app)
        .post("/api/v1/budgets")
        .set(withAuth(accessToken))
        .send(categoryBudget({ categoryId: category.id, period: "monthly" }))
        .expect(201);
      const weekly = await request(app)
        .post("/api/v1/budgets")
        .set(withAuth(accessToken))
        .send(categoryBudget({ categoryId: category.id, period: "weekly" }))
        .expect(201);
      const res = await request(app)
        .patch(`/api/v1/budgets/${weekly.body.data.id}`)
        .set(withAuth(accessToken))
        .send({ period: "monthly" });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("BUDGET_EXISTS");
    });
  });

  describe("DELETE /api/v1/budgets/:id", () => {
    it("soft-deletes a budget and removes it from the list", async () => {
      const { accessToken } = await registerAndLogin("budG@example.com");
      const budget = await createBudget(accessToken);
      const del = await request(app)
        .delete(`/api/v1/budgets/${budget.id}`)
        .set(withAuth(accessToken));
      expect(del.status).toBe(204);

      const list = await request(app)
        .get("/api/v1/budgets")
        .set(withAuth(accessToken));
      expect(list.body.data).toHaveLength(0);
    });

    it("allows re-creating a budget after it is deleted", async () => {
      const { accessToken } = await registerAndLogin("budH@example.com");
      const category = await createCategory(accessToken);
      const budgetId = (
        await request(app)
          .post("/api/v1/budgets")
          .set(withAuth(accessToken))
          .send(categoryBudget({ categoryId: category.id }))
          .expect(201)
      ).body.data.id as string;
      await request(app)
        .delete(`/api/v1/budgets/${budgetId}`)
        .set(withAuth(accessToken))
        .expect(204);
      const res = await request(app)
        .post("/api/v1/budgets")
        .set(withAuth(accessToken))
        .send(categoryBudget({ categoryId: category.id }));
      expect(res.status).toBe(201);
    });

    it("rejects deleting a non-existent budget with 404", async () => {
      const { accessToken } = await registerAndLogin("budI@example.com");
      const res = await request(app).delete(
        "/api/v1/budgets/64d8b2c0f1a2b3c4d5e6f001",
      ).set(withAuth(accessToken));
      expect(res.status).toBe(404);
    });

    it("does not allow deleting another user's budget", async () => {
      const alice = await registerAndLogin("budJ@example.com");
      const budget = await createBudget(alice.accessToken);
      const bob = await registerAndLogin("budK@example.com");
      const res = await request(app)
        .delete(`/api/v1/budgets/${budget.id}`)
        .set(withAuth(bob.accessToken));
      expect(res.status).toBe(404);
    });
  });
});
