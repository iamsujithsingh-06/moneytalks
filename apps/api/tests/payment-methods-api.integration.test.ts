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

function paymentMethodBody(overrides: Record<string, unknown> = {}) {
  return {
    clientId: randomUUID(),
    name: "HDFC Debit Card",
    kind: "card",
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

describe("Payment Methods API", () => {
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
        device: { name: "pm-test", platform: "web" },
      })
      .expect(200);
    return {
      accessToken: res.body.data.accessToken as string,
      userId: res.body.data.user.id as string,
    };
  }

  async function createPaymentMethod(accessToken: string, overrides = {}) {
    const res = await request(app)
      .post("/api/v1/payment-methods")
      .set(withAuth(accessToken))
      .send(paymentMethodBody(overrides))
      .expect(201);
    return res.body.data as { id: string; [key: string]: unknown };
  }

  describe("authentication", () => {
    it("rejects requests without a token", async () => {
      const id = new Types.ObjectId().toString();
      const get = await request(app).get("/api/v1/payment-methods");
      expect(get.status).toBe(401);
      expect(get.body.error.code).toBe("UNAUTHORIZED");

      const post = await request(app)
        .post("/api/v1/payment-methods")
        .send(paymentMethodBody());
      expect(post.status).toBe(401);

      const patch = await request(app)
        .patch(`/api/v1/payment-methods/${id}`)
        .send({ name: "X" });
      expect(patch.status).toBe(401);

      const del = await request(app).delete(`/api/v1/payment-methods/${id}`);
      expect(del.status).toBe(401);
    });
  });

  describe("POST /api/v1/payment-methods", () => {
    it("creates a payment method with the public envelope", async () => {
      const { accessToken } = await registerAndLogin("ada@example.com");
      const res = await request(app)
        .post("/api/v1/payment-methods")
        .set(withAuth(accessToken))
        .send(paymentMethodBody());
      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeTruthy();
      expect(res.body.data.name).toBe("HDFC Debit Card");
      expect(res.body.data.kind).toBe("card");
      expect(res.body.data.deleted).toBe(false);
      expect(res.body.data.status).toBe("active");
      expect(res.body.data.rev).toBe(0);
      expect(res.body.meta.requestId).toBeTruthy();
      expect(res.body.data).not.toHaveProperty("deletedAt");
      expect(res.body.data).not.toHaveProperty("deletedBy");
      expect(res.body.data).not.toHaveProperty("__v");
    });

    it("rejects a duplicate active name + kind with 409", async () => {
      const { accessToken } = await registerAndLogin("bob@example.com");
      await createPaymentMethod(accessToken, { name: "Wallet", kind: "wallet" });
      const res = await request(app)
        .post("/api/v1/payment-methods")
        .set(withAuth(accessToken))
        .send(paymentMethodBody({ name: "Wallet", kind: "wallet" }));
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("PAYMENT_METHOD_EXISTS");
    });

    it("rejects unknown fields with 422", async () => {
      const { accessToken } = await registerAndLogin("carol@example.com");
      const res = await request(app)
        .post("/api/v1/payment-methods")
        .set(withAuth(accessToken))
        .send(paymentMethodBody({ admin: true }));
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/v1/payment-methods", () => {
    it("returns the user's payment methods and applies the kind filter", async () => {
      const { accessToken } = await registerAndLogin("dave@example.com");
      await createPaymentMethod(accessToken, { name: "UPI Id", kind: "upi" });
      await createPaymentMethod(accessToken, { name: "Bank Account", kind: "bank" });

      const all = await request(app)
        .get("/api/v1/payment-methods")
        .set(withAuth(accessToken));
      expect(all.status).toBe(200);
      expect(all.body.data).toHaveLength(2);

      const filtered = await request(app)
        .get("/api/v1/payment-methods")
        .set(withAuth(accessToken))
        .query({ kind: "upi" });
      expect(filtered.status).toBe(200);
      expect(filtered.body.data).toHaveLength(1);
      expect(filtered.body.data[0].name).toBe("UPI Id");
    });

    it("includes soft-deleted payment methods with deleted=true", async () => {
      const { accessToken } = await registerAndLogin("erin@example.com");
      const pm = await createPaymentMethod(accessToken, { name: "Old Card" });
      await request(app)
        .delete(`/api/v1/payment-methods/${pm.id}`)
        .set(withAuth(accessToken))
        .expect(204);
      const all = await request(app)
        .get("/api/v1/payment-methods")
        .set(withAuth(accessToken));
      const found = all.body.data.find((p: { id: string }) => p.id === pm.id);
      expect(found.deleted).toBe(true);
    });

    it("does not return another user's payment methods", async () => {
      const alice = await registerAndLogin("frank@example.com");
      await createPaymentMethod(alice.accessToken, { name: "Secret Card" });
      const bob = await registerAndLogin("grace@example.com");
      const res = await request(app)
        .get("/api/v1/payment-methods")
        .set(withAuth(bob.accessToken));
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });
  });

  describe("PATCH /api/v1/payment-methods/:id", () => {
    it("updates allowed fields and bumps rev", async () => {
      const { accessToken } = await registerAndLogin("heidi@example.com");
      const pm = await createPaymentMethod(accessToken, { provider: "HDFC" });
      const res = await request(app)
        .patch(`/api/v1/payment-methods/${pm.id}`)
        .set(withAuth(accessToken))
        .send({
          name: "Renamed Card",
          provider: "ICICI",
          maskedNumber: "*1234",
          accountRef: "acc-1",
        });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe("Renamed Card");
      expect(res.body.data.provider).toBe("ICICI");
      expect(res.body.data.maskedNumber).toBe("*1234");
      expect(res.body.data.accountRef).toBe("acc-1");
      expect(res.body.data.rev).toBe(1);
      expect(res.body.data.kind).toBe("card");
      expect(res.body.data.clientId).toBe(pm.clientId);
    });

    it("rejects immutable fields and empty patches with 422", async () => {
      const { accessToken } = await registerAndLogin("ivan@example.com");
      const pm = await createPaymentMethod(accessToken);

      const immutable = await request(app)
        .patch(`/api/v1/payment-methods/${pm.id}`)
        .set(withAuth(accessToken))
        .send({ kind: "bank" });
      expect(immutable.status).toBe(422);

      const empty = await request(app)
        .patch(`/api/v1/payment-methods/${pm.id}`)
        .set(withAuth(accessToken))
        .send({});
      expect(empty.status).toBe(422);
    });

    it("rejects a duplicate name + kind with 409", async () => {
      const { accessToken } = await registerAndLogin("judy@example.com");
      await createPaymentMethod(accessToken, { name: "Occupied", kind: "upi" });
      const other = await createPaymentMethod(accessToken, { name: "Rename Me", kind: "upi" });
      const res = await request(app)
        .patch(`/api/v1/payment-methods/${other.id}`)
        .set(withAuth(accessToken))
        .send({ name: "Occupied" });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("PAYMENT_METHOD_EXISTS");
    });
  });

  describe("DELETE /api/v1/payment-methods/:id", () => {
    it("soft-deletes a payment method and keeps it in the list as deleted", async () => {
      const { accessToken } = await registerAndLogin("kate@example.com");
      const pm = await createPaymentMethod(accessToken, { name: "Gone Card" });
      const del = await request(app)
        .delete(`/api/v1/payment-methods/${pm.id}`)
        .set(withAuth(accessToken));
      expect(del.status).toBe(204);

      const list = await request(app)
        .get("/api/v1/payment-methods")
        .set(withAuth(accessToken));
      const found = list.body.data.find((p: { id: string }) => p.id === pm.id);
      expect(found.deleted).toBe(true);
      expect(found).not.toHaveProperty("deletedAt");
    });

    it("allows deleting a referenced payment method and keeps the transaction reference", async () => {
      const { accessToken } = await registerAndLogin("lisa@example.com");
      const pm = await createPaymentMethod(accessToken, { name: "Referenced" });
      const tx = await request(app)
        .post("/api/v1/transactions")
        .set(withAuth(accessToken))
        .send(txBody({ paymentMethodId: pm.id }))
        .expect(201);

      const del = await request(app)
        .delete(`/api/v1/payment-methods/${pm.id}`)
        .set(withAuth(accessToken));
      expect(del.status).toBe(204);

      const get = await request(app)
        .get(`/api/v1/transactions/${tx.body.data.id}`)
        .set(withAuth(accessToken));
      expect(get.body.data.paymentMethodId).toBe(pm.id);
    });
  });

  describe("defaults", () => {
    it("keeps only one default payment method per user", async () => {
      const { accessToken } = await registerAndLogin("mal@example.com");
      await createPaymentMethod(accessToken, { name: "Default A", isDefault: true });
      await createPaymentMethod(accessToken, { name: "Default B", isDefault: true });

      const list = await request(app)
        .get("/api/v1/payment-methods")
        .set(withAuth(accessToken));
      const defaults = list.body.data.filter(
        (p: { isDefault: boolean }) => p.isDefault,
      );
      expect(defaults).toHaveLength(1);
      expect(defaults[0].name).toBe("Default B");
    });

    it("clears isDefault on delete and does not promote another method", async () => {
      const { accessToken } = await registerAndLogin("nora@example.com");
      const def = await createPaymentMethod(accessToken, {
        name: "Default To Delete",
        isDefault: true,
      });
      await createPaymentMethod(accessToken, { name: "Backup Card" });

      await request(app)
        .delete(`/api/v1/payment-methods/${def.id}`)
        .set(withAuth(accessToken))
        .expect(204);

      const list = await request(app)
        .get("/api/v1/payment-methods")
        .set(withAuth(accessToken));
      const defaults = list.body.data.filter(
        (p: { isDefault: boolean }) => p.isDefault,
      );
      expect(defaults).toHaveLength(0);
    });
  });
});
