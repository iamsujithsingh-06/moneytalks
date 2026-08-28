import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildTransactionFingerprint,
  type TransactionDirection,
  type TransactionType,
} from "@moneytalks/shared";
import { createTransactionSchema } from "@moneytalks/validation";
import { syncDbIndexes } from "../src/db/index.js";
import { TransactionModel } from "../src/db/models/transaction.js";
import { AppError, ErrorCodes } from "../src/lib/errors.js";
import {
  createTransactionRepository,
  transactionRepository,
} from "../src/modules/transactions/repository.js";
import { TransactionService } from "../src/modules/transactions/service.js";
import {
  clearDatabase,
  closeDatabase,
  createTestApp,
} from "./helpers/test-app.js";

const userA = new Types.ObjectId().toString();
const userB = new Types.ObjectId().toString();

function payload(overrides: Record<string, unknown> = {}) {
  return createTransactionSchema.parse({
    clientId: randomUUID(),
    type: "expense",
    amountMinor: 5000,
    transactionDate: "2026-01-05",
    merchant: "Swiggy",
    ...overrides,
  });
}

function recordInput(overrides: Record<string, unknown> = {}) {
  return {
    userId: userA,
    clientId: randomUUID(),
    type: "expense",
    source: "manual",
    status: "confirmed",
    direction: "outflow",
    amountMinor: 5000,
    currency: "INR",
    transactionDate: new Date("2026-01-05T00:00:00Z"),
    ...overrides,
  };
}

describe("transaction domain foundation", () => {
  let service: TransactionService;

  beforeAll(async () => {
    const ctx = await createTestApp();
    await clearDatabase();
    await syncDbIndexes(ctx.logger);
    service = new TransactionService({ logger: ctx.logger });
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it("stores all five types with the derived direction", async () => {
    const cases: Array<{ type: TransactionType; direction: TransactionDirection }> = [
      { type: "income", direction: "inflow" },
      { type: "expense", direction: "outflow" },
      { type: "refund", direction: "inflow" },
      { type: "transfer", direction: "inflow" },
      { type: "adjustment", direction: "inflow" },
    ];
    for (const [index, testCase] of cases.entries()) {
      const tx = await service.create(
        payload({ type: testCase.type, amountMinor: 1000 * (index + 1) }),
        { userId: userA },
      );
      expect(tx.type).toBe(testCase.type);
      expect(tx.direction).toBe(testCase.direction);
    }
    expect(await transactionRepository.countByUser(userA)).toBe(5);
  });

  it("applies defaults and honours an explicit transfer direction", async () => {
    const tx = await service.create(
      payload({ type: "transfer", direction: "outflow", amountMinor: 250000 }),
      { userId: userA },
    );
    expect(tx.source).toBe("manual");
    expect(tx.status).toBe("confirmed");
    expect(tx.currency).toBe("INR");
    expect(tx.direction).toBe("outflow");
  });

  it("replays a create with the same clientId idempotently", async () => {
    const input = payload({ amountMinor: 424242, merchant: "BigBasket" });
    const first = await service.create(input, { userId: userA });
    const second = await service.create(input, { userId: userA });
    expect(second.id).toBe(first.id);
  });

  it("rejects the same content under a different clientId as a duplicate", async () => {
    const first = await service.create(payload({ amountMinor: 777000 }), {
      userId: userA,
    });
    const attempt = service.create(payload({ amountMinor: 777000 }), {
      userId: userA,
    });
    await expect(attempt).rejects.toBeInstanceOf(AppError);
    await expect(attempt).rejects.toMatchObject({
      statusCode: 409,
      code: ErrorCodes.DuplicateTransaction,
      details: [{ duplicateOf: first.id }],
    });
  });

  it("isolates transactions between users", async () => {
    const clientId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const input = payload({ clientId, amountMinor: 888000, merchant: "Blinkit" });
    const a = await service.create(input, { userId: userA });
    const b = await service.create(input, { userId: userB });
    expect(b.id).not.toBe(a.id);
    expect((await service.findById(userA, b.id))).toBeNull();
    expect((await service.findById(userB, b.id))?.id).toBe(b.id);
    expect((await service.findById(userA, a.id))?.id).toBe(a.id);
  });

  it("enforces the {userId, clientId} unique index per user", async () => {
    const repo = createTransactionRepository();
    const clientId = randomUUID();
    await repo.create(recordInput({ clientId }));
    await expect(repo.create(recordInput({ clientId }))).rejects.toMatchObject({
      code: 11000,
    });
    const otherUser = await repo.create(recordInput({ clientId, userId: userB }));
    expect(otherUser.clientId).toBe(clientId);
  });

  it("enforces the {userId, fingerprint} unique index per user", async () => {
    const repo = createTransactionRepository();
    const fingerprint = buildTransactionFingerprint({
      amountMinor: 60000,
      currency: "INR",
      transactionDate: "2026-02-10",
      merchant: "Zepto",
      source: "manual",
    });
    const tx = await repo.create(
      recordInput({
        amountMinor: 60000,
        transactionDate: new Date("2026-02-10T00:00:00Z"),
        merchant: "Zepto",
        fingerprint,
      }),
    );
    expect(tx.fingerprint).toBe(fingerprint);
    await expect(
      repo.create(
        recordInput({
          amountMinor: 60000,
          transactionDate: new Date("2026-02-10T00:00:00Z"),
          merchant: "Zepto",
          fingerprint,
        }),
      ),
    ).rejects.toMatchObject({ code: 11000 });
    const otherUser = await repo.create(
      recordInput({
        userId: userB,
        amountMinor: 60000,
        transactionDate: new Date("2026-02-10T00:00:00Z"),
        merchant: "Zepto",
        fingerprint,
      }),
    );
    expect(otherUser.fingerprint).toBe(fingerprint);
  });

  it("does not constrain documents without a fingerprint", async () => {
    const one = await transactionRepository.create(recordInput());
    const two = await transactionRepository.create(recordInput());
    expect(one.id).not.toBe(two.id);
  });

  it("rejects invalid enum values at the model layer", async () => {
    await expect(
      TransactionModel.create({ ...recordInput(), type: "gift" }),
    ).rejects.toMatchObject({ name: "ValidationError" });
    await expect(
      TransactionModel.create({ ...recordInput(), direction: "sideways" }),
    ).rejects.toMatchObject({ name: "ValidationError" });
  });

  it("rejects zero, negative and fractional amountMinor at the model layer", async () => {
    for (const amountMinor of [0, -1, 1.5]) {
      await expect(
        TransactionModel.create({ ...recordInput(), amountMinor }),
      ).rejects.toMatchObject({ name: "ValidationError" });
    }
  });

  it("rejects documents missing required fields", async () => {
    await expect(TransactionModel.create({ type: "expense" })).rejects.toMatchObject(
      { name: "ValidationError" },
    );
  });
});
