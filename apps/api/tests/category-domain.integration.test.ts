import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EntityStatus } from "@moneytalks/shared";
import { syncDbIndexes } from "../src/db/index.js";
import { CategoryModel } from "../src/db/models/category.js";
import { PaymentMethodModel } from "../src/db/models/payment-method.js";
import {
  clearDatabase,
  closeDatabase,
  createTestApp,
} from "./helpers/test-app.js";

const userA = new Types.ObjectId();
const userB = new Types.ObjectId();

function categoryInput(overrides: Record<string, unknown> = {}) {
  return {
    userId: userA,
    clientId: randomUUID(),
    name: "Salary",
    type: "income",
    ...overrides,
  };
}

function paymentMethodInput(overrides: Record<string, unknown> = {}) {
  return {
    userId: userA,
    clientId: randomUUID(),
    name: "HDFC Debit Card",
    kind: "card",
    ...overrides,
  };
}

describe("category & payment method domain foundation", () => {
  beforeAll(async () => {
    const ctx = await createTestApp();
    await clearDatabase();
    await syncDbIndexes(ctx.logger);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  describe("CategoryModel", () => {
    it("creates a valid category with defaults and timestamps", async () => {
      const category = await CategoryModel.create(categoryInput());
      expect(category.id).toBeTruthy();
      expect(category.userId.toString()).toBe(userA.toString());
      expect(category.name).toBe("Salary");
      expect(category.type).toBe("income");
      expect(category.sortOrder).toBe(0);
      expect(category.isPreset).toBe(false);
      expect(category.isDefault).toBe(false);
      expect(category.status).toBe(EntityStatus.Active);
      expect(category.rev).toBe(0);
      expect(category.deletedAt).toBeNull();
      expect(category.createdAt).toBeInstanceOf(Date);
      expect(category.updatedAt).toBeInstanceOf(Date);
    });

    it("enforces the {userId, name, type, deletedAt} unique index", async () => {
      const input = categoryInput({ name: "Unique Name" });
      await CategoryModel.create(input);
      await expect(
        CategoryModel.create({ ...input, clientId: randomUUID() }),
      ).rejects.toMatchObject({ code: 11000 });
    });

    it("allows the same name under a different type", async () => {
      const name = "Shared Name";
      await CategoryModel.create(categoryInput({ name, type: "income" }));
      await expect(
        CategoryModel.create(categoryInput({ name, type: "expense" })),
      ).resolves.toBeTruthy();
    });

    it("allows a soft-deleted category to coexist with a new one of the same name and type", async () => {
      const name = "Seasonal";
      await CategoryModel.create(
        categoryInput({
          name,
          type: "income",
          deletedAt: new Date("2026-01-01T00:00:00Z"),
        }),
      );
      await expect(
        CategoryModel.create(categoryInput({ name, type: "income" })),
      ).resolves.toBeTruthy();
    });

    it("enforces the {userId, clientId} unique index per user", async () => {
      const clientId = randomUUID();
      await CategoryModel.create(
        categoryInput({ clientId, name: "ClientId A", type: "expense" }),
      );
      await expect(
        CategoryModel.create(
          categoryInput({ clientId, name: "ClientId B", type: "expense" }),
        ),
      ).rejects.toMatchObject({ code: 11000 });
      await expect(
        CategoryModel.create(
          categoryInput({ clientId, name: "ClientId A", type: "expense", userId: userB }),
        ),
      ).resolves.toBeTruthy();
    });

    it("rejects invalid enum values at the model layer", async () => {
      await expect(
        CategoryModel.create({ ...categoryInput(), type: "gift" }),
      ).rejects.toMatchObject({ name: "ValidationError" });
    });

    it("rejects documents missing required fields", async () => {
      await expect(
        CategoryModel.create({ name: "No Owner" }),
      ).rejects.toMatchObject({ name: "ValidationError" });
    });
  });

  describe("PaymentMethodModel", () => {
    it("creates a valid payment method with defaults and timestamps", async () => {
      const paymentMethod = await PaymentMethodModel.create(
        paymentMethodInput(),
      );
      expect(paymentMethod.id).toBeTruthy();
      expect(paymentMethod.userId.toString()).toBe(userA.toString());
      expect(paymentMethod.name).toBe("HDFC Debit Card");
      expect(paymentMethod.kind).toBe("card");
      expect(paymentMethod.isDefault).toBe(false);
      expect(paymentMethod.status).toBe(EntityStatus.Active);
      expect(paymentMethod.rev).toBe(0);
      expect(paymentMethod.deletedAt).toBeNull();
      expect(paymentMethod.createdAt).toBeInstanceOf(Date);
      expect(paymentMethod.updatedAt).toBeInstanceOf(Date);
    });

    it("enforces the {userId, name, kind, deletedAt} unique index", async () => {
      const input = paymentMethodInput({ name: "Unique Wallet" });
      await PaymentMethodModel.create(input);
      await expect(
        PaymentMethodModel.create({ ...input, clientId: randomUUID() }),
      ).rejects.toMatchObject({ code: 11000 });
    });

    it("allows the same name under a different kind", async () => {
      const name = "Shared Pay";
      await PaymentMethodModel.create(paymentMethodInput({ name, kind: "upi" }));
      await expect(
        PaymentMethodModel.create(paymentMethodInput({ name, kind: "wallet" })),
      ).resolves.toBeTruthy();
    });

    it("allows a soft-deleted payment method to coexist with a new one of the same name and kind", async () => {
      const name = "Old Card";
      await PaymentMethodModel.create(
        paymentMethodInput({
          name,
          kind: "card",
          deletedAt: new Date("2026-01-01T00:00:00Z"),
        }),
      );
      await expect(
        PaymentMethodModel.create(paymentMethodInput({ name, kind: "card" })),
      ).resolves.toBeTruthy();
    });

    it("enforces the {userId, clientId} unique index per user", async () => {
      const clientId = randomUUID();
      await PaymentMethodModel.create(
        paymentMethodInput({ clientId, name: "ClientId A", kind: "upi" }),
      );
      await expect(
        PaymentMethodModel.create(
          paymentMethodInput({ clientId, name: "ClientId B", kind: "upi" }),
        ),
      ).rejects.toMatchObject({ code: 11000 });
      await expect(
        PaymentMethodModel.create(
          paymentMethodInput({
            clientId,
            name: "ClientId A",
            kind: "upi",
            userId: userB,
          }),
        ),
      ).resolves.toBeTruthy();
    });

    it("rejects invalid enum values at the model layer", async () => {
      await expect(
        PaymentMethodModel.create({ ...paymentMethodInput(), kind: "cash" }),
      ).rejects.toMatchObject({ name: "ValidationError" });
    });

    it("rejects documents missing required fields", async () => {
      await expect(
        PaymentMethodModel.create({ name: "No Owner" }),
      ).rejects.toMatchObject({ name: "ValidationError" });
    });
  });
});
