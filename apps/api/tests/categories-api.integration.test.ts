import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
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

function categoryBody(overrides: Record<string, unknown> = {}) {
  return {
    clientId: randomUUID(),
    name: "Custom Category",
    type: "expense",
    ...overrides,
  };
}

function txBody(overrides: Record<string, unknown> = {}) {
  return {
    clientId: randomUUID(),
    type: "expense",
    amountMinor: 12000,
    currency: "INR",
    transactionDate: "2026-01-05",
    ...overrides,
  };
}

function withAuth(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

describe("Categories API", () => {
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
        device: { name: "cat-test", platform: "web" },
      })
      .expect(200);
    return {
      accessToken: res.body.data.accessToken as string,
      userId: res.body.data.user.id as string,
    };
  }

  async function createCategory(accessToken: string, overrides = {}) {
    const res = await request(app)
      .post("/api/v1/categories")
      .set(withAuth(accessToken))
      .send(categoryBody(overrides))
      .expect(201);
    return res.body.data as { id: string; [key: string]: unknown };
  }

  describe("authentication", () => {
    it("rejects requests without a token", async () => {
      const id = new Types.ObjectId().toString();
      const get = await request(app).get("/api/v1/categories");
      expect(get.status).toBe(401);
      expect(get.body.error.code).toBe("UNAUTHORIZED");

      const getOne = await request(app).get(`/api/v1/categories/${id}`);
      expect(getOne.status).toBe(401);

      const post = await request(app).post("/api/v1/categories").send(categoryBody());
      expect(post.status).toBe(401);

      const patch = await request(app).patch(`/api/v1/categories/${id}`).send({ name: "X" });
      expect(patch.status).toBe(401);

      const del = await request(app).delete(`/api/v1/categories/${id}`).send({});
      expect(del.status).toBe(401);

      const defaults = await request(app).post("/api/v1/categories/defaults");
      expect(defaults.status).toBe(401);
    });
  });

  describe("POST /api/v1/categories", () => {
    it("creates a category with the public envelope", async () => {
      const { accessToken } = await registerAndLogin("ada@example.com");
      const res = await request(app)
        .post("/api/v1/categories")
        .set(withAuth(accessToken))
        .send(categoryBody());
      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeTruthy();
      expect(res.body.data.name).toBe("Custom Category");
      expect(res.body.data.type).toBe("expense");
      expect(res.body.data.deleted).toBe(false);
      expect(res.body.data.status).toBe("active");
      expect(res.body.data.rev).toBe(0);
      expect(res.body.meta.requestId).toBeTruthy();
      expect(res.body.data).not.toHaveProperty("deletedAt");
      expect(res.body.data).not.toHaveProperty("deletedBy");
      expect(res.body.data).not.toHaveProperty("__v");
    });

    it("rejects a duplicate active name + type with 409", async () => {
      const { accessToken } = await registerAndLogin("bob@example.com");
      await createCategory(accessToken, { name: "Duplicated", type: "expense" });
      const res = await request(app)
        .post("/api/v1/categories")
        .set(withAuth(accessToken))
        .send(categoryBody({ name: "Duplicated", type: "expense" }));
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CATEGORY_EXISTS");
    });

    it("rejects unknown fields with 422", async () => {
      const { accessToken } = await registerAndLogin("carol@example.com");
      const res = await request(app)
        .post("/api/v1/categories")
        .set(withAuth(accessToken))
        .send(categoryBody({ admin: true }));
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/v1/categories", () => {
    it("returns the user's categories and applies the type filter", async () => {
      const { accessToken } = await registerAndLogin("dave@example.com");
      await createCategory(accessToken, { name: "Food", type: "expense" });
      await createCategory(accessToken, { name: "Custom Income", type: "income" });

      const all = await request(app)
        .get("/api/v1/categories")
        .set(withAuth(accessToken));
      expect(all.status).toBe(200);
      const allNames = all.body.data.map((c: { name: string }) => c.name);
      expect(allNames).toContain("Food");
      expect(allNames).toContain("Custom Income");

      const filtered = await request(app)
        .get("/api/v1/categories")
        .set(withAuth(accessToken))
        .query({ type: "income" });
      expect(filtered.status).toBe(200);
      const filteredNames = filtered.body.data.map(
        (c: { name: string }) => c.name,
      );
      expect(filtered.body.data.every((c: { type: string }) => c.type === "income")).toBe(
        true,
      );
      expect(filteredNames).toContain("Custom Income");
      expect(filteredNames).not.toContain("Food");
    });

    it("includes soft-deleted categories with deleted=true", async () => {
      const { accessToken } = await registerAndLogin("erin@example.com");
      const category = await createCategory(accessToken, { name: "Seasonal" });
      await request(app)
        .delete(`/api/v1/categories/${category.id}`)
        .set(withAuth(accessToken))
        .send({})
        .expect(204);
      const all = await request(app)
        .get("/api/v1/categories")
        .set(withAuth(accessToken));
      const found = all.body.data.find((c: { id: string }) => c.id === category.id);
      expect(found.deleted).toBe(true);
    });

    it("does not return another user's categories", async () => {
      const alice = await registerAndLogin("frank@example.com");
      await createCategory(alice.accessToken, { name: "Secret" });
      const bob = await registerAndLogin("grace@example.com");
      const res = await request(app)
        .get("/api/v1/categories")
        .set(withAuth(bob.accessToken));
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(23);
      const names = (res.body.data as { name: string }[]).map((c) => c.name);
      expect(names).not.toContain("Secret");
    });
  });

  describe("GET /api/v1/categories/:id", () => {
    it("returns a single category", async () => {
      const { accessToken } = await registerAndLogin("heidi@example.com");
      const category = await createCategory(accessToken);
      const res = await request(app)
        .get(`/api/v1/categories/${category.id}`)
        .set(withAuth(accessToken));
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(category.id);
      expect(res.body.data).not.toHaveProperty("deletedAt");
    });

    it("returns 404 for another user's category", async () => {
      const alice = await registerAndLogin("ivan@example.com");
      const bob = await registerAndLogin("judy@example.com");
      const category = await createCategory(alice.accessToken);
      const res = await request(app)
        .get(`/api/v1/categories/${category.id}`)
        .set(withAuth(bob.accessToken));
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });

    it("returns 404 for a soft-deleted category", async () => {
      const { accessToken } = await registerAndLogin("kate@example.com");
      const category = await createCategory(accessToken);
      await request(app)
        .delete(`/api/v1/categories/${category.id}`)
        .set(withAuth(accessToken))
        .send({})
        .expect(204);
      const res = await request(app)
        .get(`/api/v1/categories/${category.id}`)
        .set(withAuth(accessToken));
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /api/v1/categories/:id", () => {
    it("updates allowed fields and bumps rev", async () => {
      const { accessToken } = await registerAndLogin("lisa@example.com");
      const category = await createCategory(accessToken, { name: "Before" });
      const res = await request(app)
        .patch(`/api/v1/categories/${category.id}`)
        .set(withAuth(accessToken))
        .send({ name: "After", icon: "plane" });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe("After");
      expect(res.body.data.icon).toBe("plane");
      expect(res.body.data.rev).toBe(1);
      expect(res.body.data.type).toBe("expense");
      expect(res.body.data.clientId).toBe(category.clientId);
    });

    it("rejects immutable fields and empty patches with 422", async () => {
      const { accessToken } = await registerAndLogin("mal@example.com");
      const category = await createCategory(accessToken);

      const immutable = await request(app)
        .patch(`/api/v1/categories/${category.id}`)
        .set(withAuth(accessToken))
        .send({ type: "income" });
      expect(immutable.status).toBe(422);

      const empty = await request(app)
        .patch(`/api/v1/categories/${category.id}`)
        .set(withAuth(accessToken))
        .send({});
      expect(empty.status).toBe(422);
    });

    it("rejects a duplicate name + type with 409", async () => {
      const { accessToken } = await registerAndLogin("nora@example.com");
      await createCategory(accessToken, { name: "Occupied", type: "expense" });
      const other = await createCategory(accessToken, { name: "Rename Me" });
      const res = await request(app)
        .patch(`/api/v1/categories/${other.id}`)
        .set(withAuth(accessToken))
        .send({ name: "Occupied" });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CATEGORY_EXISTS");
    });

    it("rejects an invalid parent with the validation contract", async () => {
      const { accessToken } = await registerAndLogin("oscar@example.com");
      const category = await createCategory(accessToken);
      const res = await request(app)
        .patch(`/api/v1/categories/${category.id}`)
        .set(withAuth(accessToken))
        .send({ parentId: new Types.ObjectId().toString() });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(res.body.error.details[0].field).toBe("parentId");
    });
  });

  describe("DELETE /api/v1/categories/:id", () => {
    it("soft-deletes an unused category", async () => {
      const { accessToken } = await registerAndLogin("pat@example.com");
      const category = await createCategory(accessToken);
      const del = await request(app)
        .delete(`/api/v1/categories/${category.id}`)
        .set(withAuth(accessToken))
        .send({});
      expect(del.status).toBe(204);
    });

    it("rejects deleting an in-use category without reassign", async () => {
      const { accessToken } = await registerAndLogin("quin@example.com");
      const category = await createCategory(accessToken);
      await request(app)
        .post("/api/v1/transactions")
        .set(withAuth(accessToken))
        .send(txBody({ categoryId: category.id }))
        .expect(201);
      const res = await request(app)
        .delete(`/api/v1/categories/${category.id}`)
        .set(withAuth(accessToken))
        .send({});
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CATEGORY_IN_USE");
    });

    it("reassigns transactions when deleting with a valid target", async () => {
      const { accessToken } = await registerAndLogin("rob@example.com");
      const source = await createCategory(accessToken, { name: "Source" });
      const target = await createCategory(accessToken, { name: "Target" });
      const child = await createCategory(accessToken, {
        name: "Child",
        parentId: source.id,
      });
      expect(child.parentId).toBe(source.id);
      const tx = await request(app)
        .post("/api/v1/transactions")
        .set(withAuth(accessToken))
        .send(txBody({ categoryId: source.id }))
        .expect(201);

      const del = await request(app)
        .delete(`/api/v1/categories/${source.id}`)
        .set(withAuth(accessToken))
        .send({ reassignToId: target.id });
      expect(del.status).toBe(204);

      const get = await request(app)
        .get(`/api/v1/transactions/${tx.body.data.id}`)
        .set(withAuth(accessToken));
      expect(get.body.data.categoryId).toBe(target.id);

      const reloadedChild = await request(app)
        .get(`/api/v1/categories/${child.id}`)
        .set(withAuth(accessToken));
      expect(reloadedChild.body.data.parentId).toBeNull();
    });

    it("clears parentId on child categories when the parent is deleted", async () => {
      const { accessToken } = await registerAndLogin("steve@example.com");
      const parent = await createCategory(accessToken, { name: "Parent" });
      const child = await createCategory(accessToken, {
        name: "Child",
        parentId: parent.id,
      });
      expect(child.parentId).toBe(parent.id);
      await request(app)
        .delete(`/api/v1/categories/${parent.id}`)
        .set(withAuth(accessToken))
        .send({})
        .expect(204);
      const get = await request(app)
        .get(`/api/v1/categories/${child.id}`)
        .set(withAuth(accessToken));
      expect(get.body.data.parentId).toBeNull();
    });
  });

  describe("POST /api/v1/categories/defaults", () => {
    it("seeds the default catalog", async () => {
      const { accessToken } = await registerAndLogin("tina@example.com");
      const res = await request(app)
        .post("/api/v1/categories/defaults")
        .set(withAuth(accessToken));
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(23);
      expect(res.body.meta.requestId).toBeTruthy();
    });

    it("is idempotent on repeated calls", async () => {
      const { accessToken } = await registerAndLogin("uma@example.com");
      await request(app)
        .post("/api/v1/categories/defaults")
        .set(withAuth(accessToken))
        .expect(200);
      const again = await request(app)
        .post("/api/v1/categories/defaults")
        .set(withAuth(accessToken));
      expect(again.status).toBe(200);
      expect(again.body.data).toHaveLength(23);
    });

    it("preserves an existing user-selected default", async () => {
      const { accessToken } = await registerAndLogin("vic@example.com");
      await createCategory(accessToken, {
        name: "My Income",
        type: "income",
        isDefault: true,
      });
      await request(app)
        .post("/api/v1/categories/defaults")
        .set(withAuth(accessToken))
        .expect(200);
      const income = await request(app)
        .get("/api/v1/categories")
        .set(withAuth(accessToken))
        .query({ type: "income" });
      const myIncome = income.body.data.find(
        (c: { name: string }) => c.name === "My Income",
      );
      const salary = income.body.data.find(
        (c: { name: string }) => c.name === "Salary",
      );
      expect(myIncome.isDefault).toBe(true);
      expect(salary.isDefault).toBe(false);
    });
  });
});
