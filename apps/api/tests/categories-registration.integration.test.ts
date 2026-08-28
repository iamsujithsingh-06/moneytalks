import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { DEFAULT_CATEGORY_CATALOG } from "@moneytalks/shared";
import type { CategoryPublic } from "@moneytalks/types";
import {
  clearDatabase,
  closeDatabase,
  createAccountRateLimiter,
  createTestApp,
  type TestApp,
} from "./helpers/test-app.js";
import { syncDbIndexes } from "../src/db/index.js";
import type { SlidingWindowRateLimiter } from "../src/lib/rate-limiter.js";
import type { AppLogger } from "../src/lib/logger.js";
import { CategoryService } from "../src/modules/categories/service.js";

const PASSWORD = "CorrectHorseBattery1";

function withAuth(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

/**
 * CategoryService whose seed path always fails, so tests can verify that
 * registration degrades gracefully without rolling back the user.
 */
class FailingCategoriesService extends CategoryService {
  constructor(logger: AppLogger) {
    super({ logger });
  }

  override async restoreDefaults(): Promise<CategoryPublic[]> {
    throw new Error("forced category seed failure");
  }
}

describe("Registration default category seeding", () => {
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
        device: { name: "seed-test", platform: "web" },
      })
      .expect(200);
    return res.body.data.accessToken as string;
  }

  it("seeds the complete default catalog for a new user", async () => {
    const accessToken = await registerAndLogin("seed-catalog@example.com");
    const res = await request(app)
      .get("/api/v1/categories")
      .set(withAuth(accessToken));
    expect(res.status).toBe(200);

    const categories = res.body.data as CategoryPublic[];
    expect(categories).toHaveLength(23);

    const income = categories.filter((c) => c.type === "income");
    const expense = categories.filter((c) => c.type === "expense");
    const transfer = categories.filter((c) => c.type === "transfer");
    expect(income).toHaveLength(7);
    expect(expense).toHaveLength(16);
    expect(transfer).toHaveLength(0);

    for (const category of categories) {
      expect(category.isPreset).toBe(true);
      expect(category.status).toBe("active");
    }

    const incomeDefaults = income.filter((c) => c.isDefault);
    const expenseDefaults = expense.filter((c) => c.isDefault);
    expect(incomeDefaults).toHaveLength(1);
    expect(incomeDefaults[0]!.name).toBe("Salary");
    expect(expenseDefaults).toHaveLength(1);
    expect(expenseDefaults[0]!.name).toBe("Food & Dining");

    for (const type of ["income", "expense"] as const) {
      const expected = DEFAULT_CATEGORY_CATALOG.filter((c) => c.type === type).sort(
        (a, b) => a.sortOrder - b.sortOrder,
      );
      const actual = categories
        .filter((c) => c.type === type)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      expect(actual.map((c) => c.name)).toEqual(expected.map((c) => c.name));
      expect(actual.map((c) => c.sortOrder)).toEqual(
        expected.map((c) => c.sortOrder),
      );
    }
  });

  it("does not seed payment methods on registration", async () => {
    const accessToken = await registerAndLogin("seed-no-pm@example.com");
    const res = await request(app)
      .get("/api/v1/payment-methods")
      .set(withAuth(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("is idempotent when restore defaults runs again", async () => {
    const accessToken = await registerAndLogin("seed-idempotent@example.com");

    const first = await request(app)
      .post("/api/v1/categories/defaults")
      .set(withAuth(accessToken));
    expect(first.status).toBe(200);
    const second = await request(app)
      .post("/api/v1/categories/defaults")
      .set(withAuth(accessToken));
    expect(second.status).toBe(200);

    const res = await request(app)
      .get("/api/v1/categories")
      .set(withAuth(accessToken));
    expect(res.body.data).toHaveLength(23);
    const keys = new Set(
      (res.body.data as CategoryPublic[]).map((c) => `${c.type}:${c.name}`),
    );
    expect(keys.size).toBe(23);
  });

  it("preserves an existing user-selected default when re-seeding", async () => {
    const accessToken = await registerAndLogin("seed-default@example.com");

    const initial = await request(app)
      .get("/api/v1/categories")
      .set(withAuth(accessToken));
    const freelance = (initial.body.data as CategoryPublic[]).find(
      (c) => c.type === "income" && c.name === "Freelance",
    );
    expect(freelance).toBeTruthy();

    const patch = await request(app)
      .patch(`/api/v1/categories/${freelance!.id}`)
      .set(withAuth(accessToken))
      .send({ isDefault: true });
    expect(patch.status).toBe(200);
    expect(patch.body.data.isDefault).toBe(true);

    await request(app)
      .post("/api/v1/categories/defaults")
      .set(withAuth(accessToken))
      .expect(200);

    const after = await request(app)
      .get("/api/v1/categories")
      .set(withAuth(accessToken));
    expect(after.body.data).toHaveLength(23);
    const incomeDefaults = (after.body.data as CategoryPublic[]).filter(
      (c) => c.type === "income" && c.isDefault,
    );
    expect(incomeDefaults).toHaveLength(1);
    expect(incomeDefaults[0]!.name).toBe("Freelance");
  });

  describe("seed failure", () => {
    let failingApp: TestApp["app"];
    let failingLogger: TestApp["logger"];

    beforeAll(async () => {
      const ctx = await createTestApp(
        {},
        {
          accountRateLimiter: createAccountRateLimiter(50),
          categoriesService: new FailingCategoriesService(logger),
        },
      );
      failingApp = ctx.app;
      failingLogger = ctx.logger;
    });

    it("still succeeds, keeps the user, and logs a warning", async () => {
      const warnSpy = vi.spyOn(failingLogger, "warn");

      const registerRes = await request(failingApp)
        .post("/api/v1/auth/register")
        .send({ email: "seed-failure@example.com", password: PASSWORD });
      expect(registerRes.status).toBe(201);
      expect(registerRes.body.data.userId).toBeTruthy();
      expect(registerRes.body.meta.requestId).toBeTruthy();
      expect(registerRes.body.data).not.toHaveProperty("seedError");

      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({ event: "category_seed_failed" }),
      );

      const loginRes = await request(failingApp)
        .post("/api/v1/auth/login")
        .send({
          email: "seed-failure@example.com",
          password: PASSWORD,
          device: { name: "seed-test", platform: "web" },
        });
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.user.email).toBe("seed-failure@example.com");

      const categories = await request(failingApp)
        .get("/api/v1/categories")
        .set(withAuth(loginRes.body.data.accessToken as string));
      expect(categories.status).toBe(200);
      expect(categories.body.data).toEqual([]);
    });
  });
});
