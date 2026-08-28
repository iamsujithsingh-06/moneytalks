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

function txBody(overrides: Record<string, unknown> = {}) {
  return {
    clientId: randomUUID(),
    type: "expense",
    amountMinor: 12000,
    currency: "INR",
    transactionDate: "2026-01-05",
    merchant: "Swiggy",
    ...overrides,
  };
}

function withAuth(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

  describe("Transactions API", () => {
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
      .send({ email, password: PASSWORD, device: { name: "tx-test", platform: "web" } })
      .expect(200);
    return {
      accessToken: res.body.data.accessToken as string,
      userId: res.body.data.user.id as string,
    };
  }

  async function createTransaction(accessToken: string, overrides = {}) {
    const res = await request(app)
      .post("/api/v1/transactions")
      .set(withAuth(accessToken))
      .send(txBody(overrides))
      .expect(201);
    return res.body.data as { id: string; [key: string]: unknown };
  }

  async function createCategory(
    accessToken: string,
    overrides: Record<string, unknown> = {},
  ) {
    const res = await request(app)
      .post("/api/v1/categories")
      .set(withAuth(accessToken))
      .send({
        clientId: randomUUID(),
        name: `Ref Category ${randomUUID()}`,
        type: "expense",
        ...overrides,
      })
      .expect(201);
    return res.body.data as { id: string; type: string; [key: string]: unknown };
  }

  async function createPaymentMethod(
    accessToken: string,
    overrides: Record<string, unknown> = {},
  ) {
    const res = await request(app)
      .post("/api/v1/payment-methods")
      .set(withAuth(accessToken))
      .send({
        clientId: randomUUID(),
        name: `Ref Method ${randomUUID()}`,
        kind: "card",
        ...overrides,
      })
      .expect(201);
    return res.body.data as { id: string; [key: string]: unknown };
  }

  describe("POST /api/v1/transactions", () => {
    it("rejects requests without a token", async () => {
      const res = await request(app).post("/api/v1/transactions").send(txBody());
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });

    it("creates a transaction and returns the envelope", async () => {
      const { accessToken } = await registerAndLogin("ada@example.com");
      const res = await request(app)
        .post("/api/v1/transactions")
        .set(withAuth(accessToken))
        .send(txBody());
      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeTruthy();
      expect(res.body.data.amountMinor).toBe(12000);
      expect(res.body.data.merchant).toBe("Swiggy");
      expect(res.body.data.direction).toBe("outflow");
      expect(res.body.data.source).toBe("manual");
      expect(res.body.data.status).toBe("confirmed");
      expect(res.body.data.currency).toBe("INR");
      expect(res.body.data.rev).toBe(0);
      expect(res.body.data.editedCount).toBe(0);
      expect(res.body.meta.requestId).toBeTruthy();
      expect(res.headers["x-request-id"]).toBeTruthy();
      expect(res.body.data).not.toHaveProperty("fingerprint");
      expect(res.body.data).not.toHaveProperty("deletedAt");
    });

    it("rejects invalid input with 422 and details", async () => {
      const { accessToken } = await registerAndLogin("bob@example.com");
      const res = await request(app)
        .post("/api/v1/transactions")
        .set(withAuth(accessToken))
        .send(txBody({ amountMinor: -5 }));
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(res.body.error.details.map((d: { field: string }) => d.field)).toContain(
        "amountMinor",
      );

      const strict = await request(app)
        .post("/api/v1/transactions")
        .set(withAuth(accessToken))
        .send(txBody({ admin: true }));
      expect(strict.status).toBe(422);
    });

    it("replays the same clientId idempotently", async () => {
      const { accessToken } = await registerAndLogin("carol@example.com");
      const body = txBody();
      const first = await createTransaction(accessToken, body);
      const res = await request(app)
        .post("/api/v1/transactions")
        .set(withAuth(accessToken))
        .send(body);
      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe(first.id);
    });

    it("rejects the same content under a different clientId", async () => {
      const { accessToken } = await registerAndLogin("dave@example.com");
      const first = await createTransaction(accessToken, { amountMinor: 77000 });
      const res = await request(app)
        .post("/api/v1/transactions")
        .set(withAuth(accessToken))
        .send(txBody({ amountMinor: 77000 }));
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("DUPLICATE_TRANSACTION");
      expect(res.body.error.details[0].duplicateOf).toBe(first.id);
    });
  });

  describe("GET /api/v1/transactions", () => {
    it("lists the user's transactions with filters", async () => {
      const { accessToken } = await registerAndLogin("erin@example.com");
      await createTransaction(accessToken, { merchant: "Swiggy", amountMinor: 12000 });
      await createTransaction(accessToken, {
        merchant: "Blinkit",
        type: "expense",
        amountMinor: 34000,
      });

      const all = await request(app)
        .get("/api/v1/transactions")
        .set(withAuth(accessToken));
      expect(all.status).toBe(200);
      expect(all.body.data).toHaveLength(2);
      expect(all.body.meta.total).toBe(2);
      expect(all.body.meta.nextCursor).toBeNull();
      expect(all.body.data[0]).not.toHaveProperty("editedBy");
      expect(all.body.data[0]).not.toHaveProperty("fingerprint");

      const filtered = await request(app)
        .get("/api/v1/transactions")
        .set(withAuth(accessToken))
        .query({ type: "expense", q: "blinkit" });
      expect(filtered.status).toBe(200);
      expect(filtered.body.data).toHaveLength(1);
      expect(filtered.body.data[0].merchant).toBe("Blinkit");

      const ranged = await request(app)
        .get("/api/v1/transactions")
        .set(withAuth(accessToken))
        .query({ from: "2026-01-05", to: "2026-01-05", minAmount: 13000 });
      expect(ranged.status).toBe(200);
      expect(ranged.body.data).toHaveLength(1);
      expect(ranged.body.data[0].amountMinor).toBe(34000);
    });

    it("paginates with a cursor", async () => {
      const { accessToken } = await registerAndLogin("frank@example.com");
      const created = await Promise.all([
        createTransaction(accessToken, { transactionDate: "2026-01-03" }),
        createTransaction(accessToken, { transactionDate: "2026-01-02" }),
        createTransaction(accessToken, { transactionDate: "2026-01-01" }),
      ]);

      const first = await request(app)
        .get("/api/v1/transactions")
        .set(withAuth(accessToken))
        .query({ limit: 2 });
      expect(first.status).toBe(200);
      expect(first.body.data).toHaveLength(2);
      expect(first.body.data[0].transactionDate).toContain("2026-01-03");
      expect(first.body.meta.nextCursor).toBeTruthy();

      const second = await request(app)
        .get("/api/v1/transactions")
        .set(withAuth(accessToken))
        .query({ limit: 2, cursor: first.body.meta.nextCursor });
      expect(second.status).toBe(200);
      expect(second.body.data).toHaveLength(1);
      expect(second.body.data[0].transactionDate).toContain("2026-01-01");
      expect(second.body.meta.nextCursor).toBeNull();

      const ids = [
        ...first.body.data.map((t: { id: string }) => t.id),
        ...second.body.data.map((t: { id: string }) => t.id),
      ];
      expect(ids.sort()).toEqual(
        created.map((t) => t.id).sort(),
      );
    });

    it("rejects an invalid limit and an undecodable cursor", async () => {
      const { accessToken } = await registerAndLogin("grace@example.com");
      await createTransaction(accessToken);

      const badLimit = await request(app)
        .get("/api/v1/transactions")
        .set(withAuth(accessToken))
        .query({ limit: 0 });
      expect(badLimit.status).toBe(422);

      const badCursor = await request(app)
        .get("/api/v1/transactions")
        .set(withAuth(accessToken))
        .query({ cursor: "not-a-cursor" });
      expect(badCursor.status).toBe(422);
      expect(badCursor.body.error.details[0].field).toBe("cursor");
    });
  });

  describe("GET /api/v1/transactions/:id", () => {
    it("returns a single transaction", async () => {
      const { accessToken } = await registerAndLogin("heidi@example.com");
      const tx = await createTransaction(accessToken);
      const res = await request(app)
        .get(`/api/v1/transactions/${tx.id}`)
        .set(withAuth(accessToken));
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(tx.id);
      expect(res.body.data).not.toHaveProperty("deletedAt");
      expect(res.body.data).not.toHaveProperty("fingerprint");
    });

    it("rejects a malformed id with 422", async () => {
      const { accessToken } = await registerAndLogin("ivan@example.com");
      const res = await request(app)
        .get("/api/v1/transactions/not-an-id")
        .set(withAuth(accessToken));
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 404 for an unknown id", async () => {
      const { accessToken } = await registerAndLogin("judy@example.com");
      const res = await request(app)
        .get(`/api/v1/transactions/${new Types.ObjectId().toString()}`)
        .set(withAuth(accessToken));
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("PATCH /api/v1/transactions/:id", () => {
    it("updates allowed fields and bumps rev and editedCount", async () => {
      const { accessToken } = await registerAndLogin("mallory@example.com");
      const tx = await createTransaction(accessToken);
      const res = await request(app)
        .patch(`/api/v1/transactions/${tx.id}`)
        .set(withAuth(accessToken))
        .send({ merchant: "BigBasket", note: "groceries", tags: ["food"] });
      expect(res.status).toBe(200);
      expect(res.body.data.merchant).toBe("BigBasket");
      expect(res.body.data.note).toBe("groceries");
      expect(res.body.data.tags).toEqual(["food"]);
      expect(res.body.data.rev).toBe(1);
      expect(res.body.data.editedCount).toBe(1);
      expect(res.body.data.id).toBe(tx.id);
    });

    it("rejects an empty body and unknown fields", async () => {
      const { accessToken } = await registerAndLogin("nina@example.com");
      const tx = await createTransaction(accessToken);

      const empty = await request(app)
        .patch(`/api/v1/transactions/${tx.id}`)
        .set(withAuth(accessToken))
        .send({});
      expect(empty.status).toBe(422);

      const unknown = await request(app)
        .patch(`/api/v1/transactions/${tx.id}`)
        .set(withAuth(accessToken))
        .send({ clientId: randomUUID() });
      expect(unknown.status).toBe(422);
    });

    it("rejects an explicit direction for a derived-type transaction", async () => {
      const { accessToken } = await registerAndLogin("oscar@example.com");
      const tx = await createTransaction(accessToken);
      const res = await request(app)
        .patch(`/api/v1/transactions/${tx.id}`)
        .set(withAuth(accessToken))
        .send({ direction: "inflow" });
      expect(res.status).toBe(422);
      expect(res.body.error.details[0].field).toBe("direction");
    });

    it("rejects a change that collides with an existing fingerprint", async () => {
      const { accessToken } = await registerAndLogin("peggy@example.com");
      await createTransaction(accessToken, {
        merchant: "Zepto",
        amountMinor: 50000,
      });
      const tx = await createTransaction(accessToken, {
        merchant: "Dunzo",
        amountMinor: 90000,
      });
      const res = await request(app)
        .patch(`/api/v1/transactions/${tx.id}`)
        .set(withAuth(accessToken))
        .send({ merchant: "Zepto", amountMinor: 50000 });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("DUPLICATE_TRANSACTION");
    });
  });

  describe("DELETE /api/v1/transactions/:id", () => {
    it("soft-deletes a transaction", async () => {
      const { accessToken } = await registerAndLogin("quinn@example.com");
      const tx = await createTransaction(accessToken);

      const del = await request(app)
        .delete(`/api/v1/transactions/${tx.id}`)
        .set(withAuth(accessToken));
      expect(del.status).toBe(204);

      const get = await request(app)
        .get(`/api/v1/transactions/${tx.id}`)
        .set(withAuth(accessToken));
      expect(get.status).toBe(404);

      const list = await request(app)
        .get("/api/v1/transactions")
        .set(withAuth(accessToken));
      expect(list.body.data).toHaveLength(0);

      const again = await request(app)
        .delete(`/api/v1/transactions/${tx.id}`)
        .set(withAuth(accessToken));
      expect(again.status).toBe(404);
    });
  });

  describe("cross-user isolation", () => {
    it("hides another user's transactions behind 404", async () => {
      const alice = await registerAndLogin("alice@example.com");
      const bob = await registerAndLogin("bob@example.com");
      const tx = await createTransaction(alice.accessToken);

      const get = await request(app)
        .get(`/api/v1/transactions/${tx.id}`)
        .set(withAuth(bob.accessToken));
      expect(get.status).toBe(404);

      const patch = await request(app)
        .patch(`/api/v1/transactions/${tx.id}`)
        .set(withAuth(bob.accessToken))
        .send({ merchant: "Hacked" });
      expect(patch.status).toBe(404);

      const del = await request(app)
        .delete(`/api/v1/transactions/${tx.id}`)
        .set(withAuth(bob.accessToken));
      expect(del.status).toBe(404);

      const list = await request(app)
        .get("/api/v1/transactions")
        .set(withAuth(bob.accessToken));
      expect(list.status).toBe(200);
      expect(list.body.data).toHaveLength(0);
    });
  });

  describe("referential integrity", () => {
    const unknownId = () => new Types.ObjectId().toString();

    describe("CREATE", () => {
      it("accepts a valid category", async () => {
        const { accessToken } = await registerAndLogin("ri-01@example.com");
        const category = await createCategory(accessToken);
        const res = await request(app)
          .post("/api/v1/transactions")
          .set(withAuth(accessToken))
          .send(txBody({ categoryId: category.id }));
        expect(res.status).toBe(201);
        expect(res.body.data.categoryId).toBe(category.id);
      });

      it("accepts a valid payment method", async () => {
        const { accessToken } = await registerAndLogin("ri-02@example.com");
        const pm = await createPaymentMethod(accessToken);
        const res = await request(app)
          .post("/api/v1/transactions")
          .set(withAuth(accessToken))
          .send(txBody({ paymentMethodId: pm.id }));
        expect(res.status).toBe(201);
        expect(res.body.data.paymentMethodId).toBe(pm.id);
      });

      it("rejects an unknown category with 404 and persists nothing", async () => {
        const { accessToken } = await registerAndLogin("ri-03@example.com");
        const res = await request(app)
          .post("/api/v1/transactions")
          .set(withAuth(accessToken))
          .send(txBody({ categoryId: unknownId() }));
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe("NOT_FOUND");

        const list = await request(app)
          .get("/api/v1/transactions")
          .set(withAuth(accessToken));
        expect(list.body.data).toHaveLength(0);
      });

      it("rejects an unknown payment method with 404", async () => {
        const { accessToken } = await registerAndLogin("ri-04@example.com");
        const res = await request(app)
          .post("/api/v1/transactions")
          .set(withAuth(accessToken))
          .send(txBody({ paymentMethodId: unknownId() }));
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe("NOT_FOUND");
      });

      it("rejects another user's category with 404", async () => {
        const alice = await registerAndLogin("ri-05@example.com");
        const bob = await registerAndLogin("ri-05b@example.com");
        const category = await createCategory(alice.accessToken);
        const res = await request(app)
          .post("/api/v1/transactions")
          .set(withAuth(bob.accessToken))
          .send(txBody({ categoryId: category.id }));
        expect(res.status).toBe(404);
      });

      it("rejects another user's payment method with 404", async () => {
        const alice = await registerAndLogin("ri-06@example.com");
        const bob = await registerAndLogin("ri-06b@example.com");
        const pm = await createPaymentMethod(alice.accessToken);
        const res = await request(app)
          .post("/api/v1/transactions")
          .set(withAuth(bob.accessToken))
          .send(txBody({ paymentMethodId: pm.id }));
        expect(res.status).toBe(404);
      });

      it("rejects a soft-deleted category with 404", async () => {
        const { accessToken } = await registerAndLogin("ri-07@example.com");
        const category = await createCategory(accessToken);
        await request(app)
          .delete(`/api/v1/categories/${category.id}`)
          .set(withAuth(accessToken))
          .send({})
          .expect(204);
        const res = await request(app)
          .post("/api/v1/transactions")
          .set(withAuth(accessToken))
          .send(txBody({ categoryId: category.id }));
        expect(res.status).toBe(404);
      });

      it("rejects a soft-deleted payment method with 404", async () => {
        const { accessToken } = await registerAndLogin("ri-08@example.com");
        const pm = await createPaymentMethod(accessToken);
        await request(app)
          .delete(`/api/v1/payment-methods/${pm.id}`)
          .set(withAuth(accessToken))
          .expect(204);
        const res = await request(app)
          .post("/api/v1/transactions")
          .set(withAuth(accessToken))
          .send(txBody({ paymentMethodId: pm.id }));
        expect(res.status).toBe(404);
      });

      const compatibleCombos = [
        ["expense", "expense"],
        ["income", "income"],
        ["refund", "expense"],
        ["transfer", "transfer"],
        ["adjustment", "income"],
        ["adjustment", "expense"],
        ["adjustment", "transfer"],
      ] as const;

      for (const [type, categoryType] of compatibleCombos) {
        it(`accepts ${type} + ${categoryType} category`, async () => {
          const { accessToken } = await registerAndLogin(
            `ri-compat-${type}-${categoryType}@example.com`,
          );
          const category = await createCategory(accessToken, {
            type: categoryType,
          });
          const res = await request(app)
            .post("/api/v1/transactions")
            .set(withAuth(accessToken))
            .send(txBody({ type, categoryId: category.id }));
          expect(res.status).toBe(201);
          expect(res.body.data.categoryId).toBe(category.id);
        });
      }

      const incompatibleCombos = [
        ["expense", "income"],
        ["income", "expense"],
        ["refund", "income"],
        ["transfer", "expense"],
      ] as const;

      for (const [type, categoryType] of incompatibleCombos) {
        it(`rejects ${type} + ${categoryType} category with 422`, async () => {
          const { accessToken } = await registerAndLogin(
            `ri-incompat-${type}-${categoryType}@example.com`,
          );
          const category = await createCategory(accessToken, {
            type: categoryType,
          });
          const res = await request(app)
            .post("/api/v1/transactions")
            .set(withAuth(accessToken))
            .send(txBody({ type, categoryId: category.id }));
          expect(res.status).toBe(422);
          expect(res.body.error.code).toBe("VALIDATION_ERROR");
          expect(
            (res.body.error.details as { field: string }[]).map((d) => d.field),
          ).toContain("categoryId");

          const list = await request(app)
            .get("/api/v1/transactions")
            .set(withAuth(accessToken));
          expect(list.body.data).toHaveLength(0);
        });
      }

      it("still replays idempotently when the referenced category is later deleted", async () => {
        const { accessToken } = await registerAndLogin("ri-replay@example.com");
        const category = await createCategory(accessToken);
        const body = txBody({ categoryId: category.id });
        const first = await request(app)
          .post("/api/v1/transactions")
          .set(withAuth(accessToken))
          .send(body)
          .expect(201);
        await request(app)
          .delete(`/api/v1/transactions/${first.body.data.id}`)
          .set(withAuth(accessToken))
          .expect(204);
        await request(app)
          .delete(`/api/v1/categories/${category.id}`)
          .set(withAuth(accessToken))
          .send({})
          .expect(204);
        const replay = await request(app)
          .post("/api/v1/transactions")
          .set(withAuth(accessToken))
          .send(body);
        expect(replay.status).toBe(201);
        expect(replay.body.data.id).toBe(first.body.data.id);
      });
    });

    describe("UPDATE", () => {
      it("assigns a valid category", async () => {
        const { accessToken } = await registerAndLogin("ri-u-01@example.com");
        const category = await createCategory(accessToken);
        const tx = await createTransaction(accessToken);
        const res = await request(app)
          .patch(`/api/v1/transactions/${tx.id}`)
          .set(withAuth(accessToken))
          .send({ categoryId: category.id });
        expect(res.status).toBe(200);
        expect(res.body.data.categoryId).toBe(category.id);
      });

      it("assigns a valid payment method", async () => {
        const { accessToken } = await registerAndLogin("ri-u-02@example.com");
        const pm = await createPaymentMethod(accessToken);
        const tx = await createTransaction(accessToken);
        const res = await request(app)
          .patch(`/api/v1/transactions/${tx.id}`)
          .set(withAuth(accessToken))
          .send({ paymentMethodId: pm.id });
        expect(res.status).toBe(200);
        expect(res.body.data.paymentMethodId).toBe(pm.id);
      });

      it("clears a category with null", async () => {
        const { accessToken } = await registerAndLogin("ri-u-03@example.com");
        const category = await createCategory(accessToken);
        const tx = await createTransaction(accessToken, {
          categoryId: category.id,
        });
        const res = await request(app)
          .patch(`/api/v1/transactions/${tx.id}`)
          .set(withAuth(accessToken))
          .send({ categoryId: null });
        expect(res.status).toBe(200);
        expect(res.body.data.categoryId).toBeNull();
      });

      it("clears a payment method with null", async () => {
        const { accessToken } = await registerAndLogin("ri-u-04@example.com");
        const pm = await createPaymentMethod(accessToken);
        const tx = await createTransaction(accessToken, {
          paymentMethodId: pm.id,
        });
        const res = await request(app)
          .patch(`/api/v1/transactions/${tx.id}`)
          .set(withAuth(accessToken))
          .send({ paymentMethodId: null });
        expect(res.status).toBe(200);
        expect(res.body.data.paymentMethodId).toBeNull();
      });

      it("rejects an invalid category with 404 and leaves the transaction unchanged", async () => {
        const { accessToken } = await registerAndLogin("ri-u-05@example.com");
        const tx = await createTransaction(accessToken);
        const res = await request(app)
          .patch(`/api/v1/transactions/${tx.id}`)
          .set(withAuth(accessToken))
          .send({ categoryId: unknownId() });
        expect(res.status).toBe(404);

        const get = await request(app)
          .get(`/api/v1/transactions/${tx.id}`)
          .set(withAuth(accessToken));
        expect(get.status).toBe(200);
        expect(get.body.data.categoryId).toBeNull();
      });

      it("rejects an invalid payment method with 404", async () => {
        const { accessToken } = await registerAndLogin("ri-u-06@example.com");
        const tx = await createTransaction(accessToken);
        const res = await request(app)
          .patch(`/api/v1/transactions/${tx.id}`)
          .set(withAuth(accessToken))
          .send({ paymentMethodId: unknownId() });
        expect(res.status).toBe(404);
      });

      it("rejects another user's category with 404", async () => {
        const alice = await registerAndLogin("ri-u-07@example.com");
        const bob = await registerAndLogin("ri-u-07b@example.com");
        const category = await createCategory(alice.accessToken);
        const tx = await createTransaction(bob.accessToken);
        const res = await request(app)
          .patch(`/api/v1/transactions/${tx.id}`)
          .set(withAuth(bob.accessToken))
          .send({ categoryId: category.id });
        expect(res.status).toBe(404);
      });

      it("rejects another user's payment method with 404", async () => {
        const alice = await registerAndLogin("ri-u-08@example.com");
        const bob = await registerAndLogin("ri-u-08b@example.com");
        const pm = await createPaymentMethod(alice.accessToken);
        const tx = await createTransaction(bob.accessToken);
        const res = await request(app)
          .patch(`/api/v1/transactions/${tx.id}`)
          .set(withAuth(bob.accessToken))
          .send({ paymentMethodId: pm.id });
        expect(res.status).toBe(404);
      });

      it("rejects a soft-deleted category with 404", async () => {
        const { accessToken } = await registerAndLogin("ri-u-09@example.com");
        const category = await createCategory(accessToken);
        const tx = await createTransaction(accessToken);
        await request(app)
          .delete(`/api/v1/categories/${category.id}`)
          .set(withAuth(accessToken))
          .send({})
          .expect(204);
        const res = await request(app)
          .patch(`/api/v1/transactions/${tx.id}`)
          .set(withAuth(accessToken))
          .send({ categoryId: category.id });
        expect(res.status).toBe(404);
      });

      it("rejects a soft-deleted payment method with 404", async () => {
        const { accessToken } = await registerAndLogin("ri-u-10@example.com");
        const pm = await createPaymentMethod(accessToken);
        const tx = await createTransaction(accessToken);
        await request(app)
          .delete(`/api/v1/payment-methods/${pm.id}`)
          .set(withAuth(accessToken))
          .expect(204);
        const res = await request(app)
          .patch(`/api/v1/transactions/${tx.id}`)
          .set(withAuth(accessToken))
          .send({ paymentMethodId: pm.id });
        expect(res.status).toBe(404);
      });

      it("allows a type change when the existing category stays compatible", async () => {
        const { accessToken } = await registerAndLogin("ri-u-11@example.com");
        const category = await createCategory(accessToken, { type: "expense" });
        const tx = await createTransaction(accessToken, {
          type: "expense",
          categoryId: category.id,
        });
        const res = await request(app)
          .patch(`/api/v1/transactions/${tx.id}`)
          .set(withAuth(accessToken))
          .send({ type: "refund" });
        expect(res.status).toBe(200);
        expect(res.body.data.type).toBe("refund");
        expect(res.body.data.categoryId).toBe(category.id);
      });

      it("rejects a type change leaving an incompatible existing category", async () => {
        const { accessToken } = await registerAndLogin("ri-u-12@example.com");
        const category = await createCategory(accessToken, { type: "expense" });
        const tx = await createTransaction(accessToken, {
          type: "expense",
          categoryId: category.id,
        });
        const res = await request(app)
          .patch(`/api/v1/transactions/${tx.id}`)
          .set(withAuth(accessToken))
          .send({ type: "income" });
        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe("VALIDATION_ERROR");
        expect(
          (res.body.error.details as { field: string }[]).map((d) => d.field),
        ).toContain("categoryId");
      });

      it("accepts a type + new compatible category in the same patch", async () => {
        const { accessToken } = await registerAndLogin("ri-u-13@example.com");
        const category = await createCategory(accessToken, { type: "income" });
        const tx = await createTransaction(accessToken);
        const res = await request(app)
          .patch(`/api/v1/transactions/${tx.id}`)
          .set(withAuth(accessToken))
          .send({ type: "income", categoryId: category.id });
        expect(res.status).toBe(200);
        expect(res.body.data.type).toBe("income");
        expect(res.body.data.categoryId).toBe(category.id);
      });

      it("rejects a type + incompatible category in the same patch", async () => {
        const { accessToken } = await registerAndLogin("ri-u-14@example.com");
        const category = await createCategory(accessToken, { type: "income" });
        const tx = await createTransaction(accessToken);
        const res = await request(app)
          .patch(`/api/v1/transactions/${tx.id}`)
          .set(withAuth(accessToken))
          .send({ type: "expense", categoryId: category.id });
        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe("VALIDATION_ERROR");
      });
    });
  });
});
