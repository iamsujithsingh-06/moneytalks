import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CreatePaymentMethodData } from "@moneytalks/types";
import type { AppLogger } from "../src/lib/logger.js";
import { syncDbIndexes } from "../src/db/index.js";
import { TransactionModel } from "../src/db/models/transaction.js";
import { ErrorCodes } from "../src/lib/errors.js";
import {
  paymentMethodRepository,
  type PaymentMethodRepository,
} from "../src/modules/payment-methods/repository.js";
import { PaymentMethodService } from "../src/modules/payment-methods/service.js";
import { transactionRepository } from "../src/modules/transactions/repository.js";
import {
  clearDatabase,
  closeDatabase,
  createTestApp,
} from "./helpers/test-app.js";

const userA = new Types.ObjectId().toString();
const userB = new Types.ObjectId().toString();

function paymentMethodInput(
  overrides: Partial<CreatePaymentMethodData> = {},
): CreatePaymentMethodData {
  return {
    clientId: randomUUID(),
    name: "HDFC Debit Card",
    kind: "card",
    ...overrides,
  };
}

function txInput(
  userId: string,
  paymentMethodId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    userId,
    clientId: randomUUID(),
    type: "expense",
    source: "manual",
    status: "confirmed",
    direction: "outflow",
    amountMinor: 1000,
    currency: "INR",
    transactionDate: new Date("2026-01-05T00:00:00Z"),
    paymentMethodId,
    ...overrides,
  };
}

describe("payment method service", () => {
  let service: PaymentMethodService;

  beforeAll(async () => {
    const ctx = await createTestApp();
    await clearDatabase();
    await syncDbIndexes(ctx.logger);
    service = new PaymentMethodService({ logger: ctx.logger });
  });

  afterAll(async () => {
    await closeDatabase();
  });

  describe("create", () => {
    it("creates a valid payment method with sensible defaults", async () => {
      const pm = await service.create(paymentMethodInput(), { userId: userA });
      expect(pm.id).toBeTruthy();
      expect(pm.userId).toBe(userA);
      expect(pm.name).toBe("HDFC Debit Card");
      expect(pm.kind).toBe("card");
      expect(pm.provider).toBeNull();
      expect(pm.maskedNumber).toBeNull();
      expect(pm.accountRef).toBeNull();
      expect(pm.isDefault).toBe(false);
      expect(pm.status).toBe("active");
      expect(pm.deleted).toBe(false);
      expect(pm.rev).toBe(0);
      expect(pm.createdAt).toBeTruthy();
      expect(pm.updatedAt).toBeTruthy();
    });

    it("isolates payment methods between users", async () => {
      const created = await service.create(
        paymentMethodInput({ name: "Isolated Pay" }),
        { userId: userA },
      );
      expect(await service.findById(userB, created.id)).toBeNull();
      await expect(
        service.create(
          paymentMethodInput({ name: "Isolated Pay" }),
          { userId: userB },
        ),
      ).resolves.toBeTruthy();
    });

    it("rejects a duplicate active name + kind with PAYMENT_METHOD_EXISTS", async () => {
      await service.create(
        paymentMethodInput({ name: "Duplicated Pay", kind: "wallet" }),
        { userId: userA },
      );
      await expect(
        service.create(
          paymentMethodInput({ name: "Duplicated Pay", kind: "wallet" }),
          { userId: userA },
        ),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: ErrorCodes.PaymentMethodExists,
      });
    });

    it("allows the same name under a different kind", async () => {
      const name = "SameName Pay";
      await service.create(paymentMethodInput({ name, kind: "upi" }), {
        userId: userA,
      });
      await expect(
        service.create(paymentMethodInput({ name, kind: "bank" }), {
          userId: userA,
        }),
      ).resolves.toBeTruthy();
    });

    it("enforces one default per user on create", async () => {
      const first = await service.create(
        paymentMethodInput({ name: "Default Pay A", isDefault: true }),
        { userId: userA },
      );
      const second = await service.create(
        paymentMethodInput({ name: "Default Pay B", isDefault: true }),
        { userId: userA },
      );
      const reloadedFirst = await service.findById(userA, first.id);
      expect(reloadedFirst?.isDefault).toBe(false);
      expect(second.isDefault).toBe(true);
    });

    it("creates a non-default payment method without disturbing an existing default", async () => {
      const keeper = await service.create(
        paymentMethodInput({ name: "Keep Default", isDefault: true }),
        { userId: userA },
      );
      const plain = await service.create(
        paymentMethodInput({ name: "Plain Add" }),
        { userId: userA },
      );
      expect(plain.isDefault).toBe(false);
      const reloadedKeeper = await service.findById(userA, keeper.id);
      expect(reloadedKeeper?.isDefault).toBe(true);
    });
  });

  describe("update", () => {
    it("updates mutable fields and keeps kind/clientId immutable", async () => {
      const pm = await service.create(
        paymentMethodInput({ name: "Updatable Pay", provider: "HDFC" }),
        { userId: userA },
      );
      const updated = await service.update(userA, pm.id, {
        name: "Updated Pay",
        provider: "ICICI",
        maskedNumber: "*1234",
        accountRef: "acc-1",
      });
      expect(updated.name).toBe("Updated Pay");
      expect(updated.provider).toBe("ICICI");
      expect(updated.maskedNumber).toBe("*1234");
      expect(updated.accountRef).toBe("acc-1");
      expect(updated.kind).toBe("card");
      expect(updated.clientId).toBe(pm.clientId);
      expect(updated.userId).toBe(userA);
    });

    it("increments rev on update", async () => {
      const pm = await service.create(
        paymentMethodInput({ name: "Rev Up Pay" }),
        { userId: userA },
      );
      const updated = await service.update(userA, pm.id, {
        name: "Rev Up Pay 2",
      });
      expect(updated.rev).toBe(pm.rev + 1);
    });

    it("rejects renaming to an existing active name + kind", async () => {
      await service.create(
        paymentMethodInput({ name: "Occupied Pay", kind: "upi" }),
        { userId: userA },
      );
      const other = await service.create(
        paymentMethodInput({ name: "Rename Me Pay", kind: "upi" }),
        { userId: userA },
      );
      await expect(
        service.update(userA, other.id, { name: "Occupied Pay" }),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: ErrorCodes.PaymentMethodExists,
      });
    });

    it("enforces one default on update", async () => {
      const a = await service.create(
        paymentMethodInput({ name: "Default Up A", isDefault: true }),
        { userId: userA },
      );
      const b = await service.create(
        paymentMethodInput({ name: "Default Up B" }),
        { userId: userA },
      );
      await service.update(userA, b.id, { isDefault: true });
      const reloadedA = await service.findById(userA, a.id);
      const reloadedB = await service.findById(userA, b.id);
      expect(reloadedA?.isDefault).toBe(false);
      expect(reloadedB?.isDefault).toBe(true);
    });

    it("archives a payment method via status update", async () => {
      const pm = await service.create(
        paymentMethodInput({ name: "Archive Pay" }),
        { userId: userA },
      );
      const updated = await service.update(userA, pm.id, {
        status: "archived",
      });
      expect(updated.status).toBe("archived");
    });

    it("rejects updating a soft-deleted payment method", async () => {
      const pm = await service.create(
        paymentMethodInput({ name: "Deleted No Up" }),
        { userId: userA },
      );
      await service.softDelete(userA, pm.id, userA);
      await expect(
        service.update(userA, pm.id, { name: "Nope" }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("treats another user's payment method as not found", async () => {
      const pm = await service.create(
        paymentMethodInput({ name: "Cross User Up" }),
        { userId: userA },
      );
      await expect(
        service.update(userB, pm.id, { name: "Nope" }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe("list/find", () => {
    it("filters by kind and orders deterministically by createdAt", async () => {
      await service.create(
        paymentMethodInput({ name: "List Pay C", kind: "upi" }),
        { userId: userA },
      );
      await service.create(
        paymentMethodInput({ name: "List Pay A", kind: "upi" }),
        { userId: userA },
      );
      await service.create(
        paymentMethodInput({ name: "List Pay B", kind: "bank" }),
        { userId: userA },
      );
      const upi = await service.list(userA, { kind: "upi" });
      expect(upi.every((pm) => pm.kind === "upi")).toBe(true);
      const sorted = upi.every(
        (pm, i, arr) => i === 0 || arr[i - 1]!.createdAt <= pm.createdAt,
      );
      expect(sorted).toBe(true);
      const bank = await service.list(userA, { kind: "bank" });
      expect(bank.every((pm) => pm.kind === "bank")).toBe(true);
    });

    it("includes soft-deleted payment methods in the list", async () => {
      const pm = await service.create(
        paymentMethodInput({ name: "List Del Pay" }),
        { userId: userA },
      );
      await service.softDelete(userA, pm.id, userA);
      const all = await service.list(userA, {});
      const found = all.find((p) => p.id === pm.id);
      expect(found?.deleted).toBe(true);
    });

    it("isolates lists between users", async () => {
      await service.create(paymentMethodInput({ name: "Only Mine Pay" }), {
        userId: userA,
      });
      const theirs = await service.list(userB, {});
      expect(theirs.some((p) => p.name === "Only Mine Pay")).toBe(false);
    });

    it("findById returns active records for the owner only", async () => {
      const pm = await service.create(
        paymentMethodInput({ name: "Find Me Pay" }),
        { userId: userA },
      );
      expect((await service.findById(userA, pm.id))?.id).toBe(pm.id);
      expect(await service.findById(userB, pm.id)).toBeNull();
      await service.softDelete(userA, pm.id, userA);
      expect(await service.findById(userA, pm.id)).toBeNull();
    });
  });

  describe("softDelete", () => {
    it("soft-deletes an unused payment method and populates metadata", async () => {
      const pm = await service.create(
        paymentMethodInput({ name: "Unused Delete Pay" }),
        { userId: userA },
      );
      await service.softDelete(userA, pm.id, userA);
      const deleted = await paymentMethodRepository.findById(userA, pm.id);
      expect(deleted?.deletedAt).not.toBeNull();
      expect(deleted?.deletedBy).toBe(userA);
      expect(deleted?.rev).toBe(pm.rev + 1);
      expect(deleted?.isDefault).toBe(false);
    });

    it("clears the default without promoting another payment method", async () => {
      const def = await service.create(
        paymentMethodInput({ name: "Default To Delete", isDefault: true }),
        { userId: userA },
      );
      const other = await service.create(
        paymentMethodInput({ name: "Not Promoted Pay" }),
        { userId: userA },
      );
      await service.softDelete(userA, def.id, userA);
      const reloadedOther = await service.findById(userA, other.id);
      expect(reloadedOther?.isDefault).toBe(false);
      const deletedDefault = await paymentMethodRepository.findById(
        userA,
        def.id,
      );
      expect(deletedDefault?.isDefault).toBe(false);
    });

    it("is idempotent on duplicate delete", async () => {
      const pm = await service.create(
        paymentMethodInput({ name: "Double Delete Pay" }),
        { userId: userA },
      );
      await service.softDelete(userA, pm.id, userA);
      await expect(service.softDelete(userA, pm.id, userA)).resolves.toBe(
        undefined,
      );
    });

    it("allows deleting a referenced payment method and keeps the transaction reference", async () => {
      const pm = await service.create(
        paymentMethodInput({ name: "Referenced Pay" }),
        { userId: userA },
      );
      const tx = await transactionRepository.create(txInput(userA, pm.id));
      await expect(
        service.softDelete(userA, pm.id, userA),
      ).resolves.toBeUndefined();
      const doc = await TransactionModel.findOne({ _id: tx.id }).exec();
      expect(doc?.paymentMethodId?.toString()).toBe(pm.id);
      expect(doc?.deletedAt).toBeNull();
    });

    it("treats another user's payment method as not found on delete", async () => {
      const pm = await service.create(
        paymentMethodInput({ name: "Cross User Del" }),
        { userId: userA },
      );
      await expect(
        service.softDelete(userB, pm.id, userA),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe("race/error handling", () => {
    it("maps a duplicate persistence race to PAYMENT_METHOD_EXISTS", async () => {
      const real = await service.create(
        paymentMethodInput({ name: "Race Pay", kind: "upi" }),
        { userId: userA },
      );
      let firstCheck = true;
      const fakeRepo: PaymentMethodRepository = {
        ...paymentMethodRepository,
        findByNameAndKind: async () => {
          if (firstCheck) {
            firstCheck = false;
            return null;
          }
          return paymentMethodRepository.findById(userA, real.id);
        },
        create: async () => {
          throw Object.assign(new Error("duplicate key"), { code: 11000 });
        },
      };
      const svc = new PaymentMethodService({
        logger: {} as AppLogger,
        repository: fakeRepo,
      });
      await expect(
        svc.create(paymentMethodInput({ name: "Race Pay", kind: "upi" }), {
          userId: userA,
        }),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: ErrorCodes.PaymentMethodExists,
      });
    });

    it("does not leak a raw MongoDB error when the backstop finds no survivor", async () => {
      const fakeRepo: PaymentMethodRepository = {
        ...paymentMethodRepository,
        findByNameAndKind: async () => null,
        create: async () => {
          throw Object.assign(new Error("duplicate key"), { code: 11000 });
        },
      };
      const svc = new PaymentMethodService({
        logger: {} as AppLogger,
        repository: fakeRepo,
      });
      await expect(
        svc.create(paymentMethodInput({ name: "No Leak Pay" }), {
          userId: userA,
        }),
      ).rejects.toMatchObject({
        statusCode: 500,
        code: ErrorCodes.Internal,
      });
    });
  });
});
