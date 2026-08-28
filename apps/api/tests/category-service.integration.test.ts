import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CreateCategoryData } from "@moneytalks/types";
import { syncDbIndexes } from "../src/db/index.js";
import { TransactionModel } from "../src/db/models/transaction.js";
import { ErrorCodes } from "../src/lib/errors.js";
import { categoryRepository } from "../src/modules/categories/repository.js";
import { CategoryService } from "../src/modules/categories/service.js";
import { transactionRepository } from "../src/modules/transactions/repository.js";
import {
  clearDatabase,
  closeDatabase,
  createTestApp,
} from "./helpers/test-app.js";

const userA = new Types.ObjectId().toString();
const userB = new Types.ObjectId().toString();
const userC = new Types.ObjectId().toString();
const userD = new Types.ObjectId().toString();
const userE = new Types.ObjectId().toString();

function categoryInput(
  overrides: Partial<CreateCategoryData> = {},
): CreateCategoryData {
  return {
    clientId: randomUUID(),
    name: "Travel",
    type: "expense",
    ...overrides,
  };
}

function txInput(
  userId: string,
  categoryId: string,
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
    categoryId,
    ...overrides,
  };
}

describe("category service", () => {
  let service: CategoryService;

  beforeAll(async () => {
    const ctx = await createTestApp();
    await clearDatabase();
    await syncDbIndexes(ctx.logger);
    service = new CategoryService({ logger: ctx.logger });
  });

  afterAll(async () => {
    await closeDatabase();
  });

  describe("create", () => {
    it("creates a valid category with sensible defaults", async () => {
      const category = await service.create(categoryInput(), { userId: userA });
      expect(category.id).toBeTruthy();
      expect(category.userId).toBe(userA);
      expect(category.name).toBe("Travel");
      expect(category.type).toBe("expense");
      expect(category.icon).toBeNull();
      expect(category.color).toBeNull();
      expect(category.parentId).toBeNull();
      expect(category.sortOrder).toBe(1);
      expect(category.isPreset).toBe(false);
      expect(category.isDefault).toBe(false);
      expect(category.status).toBe("active");
      expect(category.deleted).toBe(false);
      expect(category.rev).toBe(0);
      expect(category.createdAt).toBeTruthy();
      expect(category.updatedAt).toBeTruthy();
    });

    it("isolates categories between users", async () => {
      const created = await service.create(
        categoryInput({ name: "Isolated", type: "income" }),
        { userId: userA },
      );
      expect(await service.findById(userB, created.id)).toBeNull();
      await expect(
        service.create(
          categoryInput({ name: "Isolated", type: "income" }),
          { userId: userB },
        ),
      ).resolves.toBeTruthy();
    });

    it("rejects a duplicate active name + type with CATEGORY_EXISTS", async () => {
      await service.create(
        categoryInput({ name: "Duplicated", type: "expense" }),
        { userId: userA },
      );
      await expect(
        service.create(
          categoryInput({ name: "Duplicated", type: "expense" }),
          { userId: userA },
        ),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: ErrorCodes.CategoryExists,
      });
    });

    it("allows the same name under a different type", async () => {
      const name = "SameName";
      await service.create(categoryInput({ name, type: "income" }), {
        userId: userA,
      });
      await expect(
        service.create(categoryInput({ name, type: "expense" }), {
          userId: userA,
        }),
      ).resolves.toBeTruthy();
    });

    it("assigns the next sortOrder automatically", async () => {
      const first = await service.create(
        categoryInput({ name: "Auto Sort", type: "income" }),
        { userId: userA },
      );
      const second = await service.create(
        categoryInput({ name: "Auto Sort 2", type: "income" }),
        { userId: userA },
      );
      expect(second.sortOrder).toBeGreaterThan(first.sortOrder);
    });

    it("respects an explicit sortOrder", async () => {
      const category = await service.create(
        categoryInput({ name: "Explicit Sort", sortOrder: 42 }),
        { userId: userA },
      );
      expect(category.sortOrder).toBe(42);
    });

    it("enforces one default per user + type on create", async () => {
      const first = await service.create(
        categoryInput({
          name: "Default A",
          type: "income",
          isDefault: true,
        }),
        { userId: userA },
      );
      const second = await service.create(
        categoryInput({
          name: "Default B",
          type: "income",
          isDefault: true,
        }),
        { userId: userA },
      );
      const reloadedFirst = await service.findById(userA, first.id);
      expect(reloadedFirst?.isDefault).toBe(false);
      expect(second.isDefault).toBe(true);
    });
  });

  describe("parent", () => {
    it("accepts a valid same-user same-type parent", async () => {
      const parent = await service.create(
        categoryInput({ name: "Parent Cat" }),
        { userId: userA },
      );
      const child = await service.create(
        categoryInput({ name: "Child Cat", parentId: parent.id }),
        { userId: userA },
      );
      expect(child.parentId).toBe(parent.id);
    });

    it("rejects a cross-user parent", async () => {
      const parent = await service.create(
        categoryInput({ name: "Other Parent" }),
        { userId: userB },
      );
      await expect(
        service.create(
          categoryInput({ name: "X User Child", parentId: parent.id }),
          { userId: userA },
        ),
      ).rejects.toMatchObject({ statusCode: 422 });
    });

    it("rejects a different-type parent", async () => {
      const parent = await service.create(
        categoryInput({ name: "Income Parent", type: "income" }),
        { userId: userA },
      );
      await expect(
        service.create(
          categoryInput({
            name: "Mismatch Child",
            type: "expense",
            parentId: parent.id,
          }),
          { userId: userA },
        ),
      ).rejects.toMatchObject({ statusCode: 422 });
    });

    it("rejects a soft-deleted parent", async () => {
      const parent = await service.create(
        categoryInput({ name: "To Delete Parent" }),
        { userId: userA },
      );
      await service.softDelete(userA, parent.id, userA);
      await expect(
        service.create(
          categoryInput({ name: "Orphan Child", parentId: parent.id }),
          { userId: userA },
        ),
      ).rejects.toMatchObject({ statusCode: 422 });
    });

    it("rejects self-parent on update", async () => {
      const category = await service.create(
        categoryInput({ name: "Self Parent" }),
        { userId: userA },
      );
      await expect(
        service.update(userA, category.id, { parentId: category.id }),
      ).rejects.toMatchObject({ statusCode: 422 });
    });

    it("rejects parent cycles on update", async () => {
      const a = await service.create(
        categoryInput({ name: "Cycle A" }),
        { userId: userA },
      );
      const b = await service.create(
        categoryInput({ name: "Cycle B", parentId: a.id }),
        { userId: userA },
      );
      await expect(
        service.update(userA, a.id, { parentId: b.id }),
      ).rejects.toMatchObject({ statusCode: 422 });
    });
  });

  describe("update", () => {
    it("updates mutable fields and leaves immutable ones intact", async () => {
      const category = await service.create(
        categoryInput({ name: "Updatable", icon: "a" }),
        { userId: userA },
      );
      const updated = await service.update(userA, category.id, {
        name: "Updated Name",
        icon: "b",
        color: "#a1b2c3",
      });
      expect(updated.name).toBe("Updated Name");
      expect(updated.icon).toBe("b");
      expect(updated.color).toBe("#a1b2c3");
      expect(updated.type).toBe("expense");
      expect(updated.clientId).toBe(category.clientId);
      expect(updated.isPreset).toBe(false);
    });

    it("increments rev on update", async () => {
      const category = await service.create(
        categoryInput({ name: "Rev Check" }),
        { userId: userA },
      );
      const updated = await service.update(userA, category.id, {
        name: "Rev Check 2",
      });
      expect(updated.rev).toBe(category.rev + 1);
    });

    it("rejects renaming to an existing active name + type", async () => {
      await service.create(
        categoryInput({ name: "Occupied Name" }),
        { userId: userA },
      );
      const other = await service.create(
        categoryInput({ name: "Rename Me" }),
        { userId: userA },
      );
      await expect(
        service.update(userA, other.id, { name: "Occupied Name" }),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: ErrorCodes.CategoryExists,
      });
    });

    it("changes and clears parentId on update", async () => {
      const parentA = await service.create(
        categoryInput({ name: "Parent Swap A" }),
        { userId: userA },
      );
      const parentB = await service.create(
        categoryInput({ name: "Parent Swap B" }),
        { userId: userA },
      );
      const child = await service.create(
        categoryInput({ name: "Swap Child", parentId: parentA.id }),
        { userId: userA },
      );
      const changed = await service.update(userA, child.id, {
        parentId: parentB.id,
      });
      expect(changed.parentId).toBe(parentB.id);
      const cleared = await service.update(userA, child.id, { parentId: null });
      expect(cleared.parentId).toBeNull();
    });

    it("enforces one default on update", async () => {
      const a = await service.create(
        categoryInput({ name: "Default Target A", isDefault: true }),
        { userId: userA },
      );
      const b = await service.create(
        categoryInput({ name: "Default Target B" }),
        { userId: userA },
      );
      await service.update(userA, b.id, { isDefault: true });
      const reloadedA = await service.findById(userA, a.id);
      const reloadedB = await service.findById(userA, b.id);
      expect(reloadedA?.isDefault).toBe(false);
      expect(reloadedB?.isDefault).toBe(true);
    });

    it("archives a category via status update", async () => {
      const category = await service.create(
        categoryInput({ name: "Archive Me" }),
        { userId: userA },
      );
      const archived = await service.update(userA, category.id, {
        status: "archived",
      });
      expect(archived.status).toBe("archived");
    });

    it("rejects updating a soft-deleted category", async () => {
      const category = await service.create(
        categoryInput({ name: "Deleted No Update" }),
        { userId: userA },
      );
      await service.softDelete(userA, category.id, userA);
      await expect(
        service.update(userA, category.id, { name: "Nope" }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe("list/find", () => {
    it("filters by type and orders deterministically by sortOrder", async () => {
      await service.create(
        categoryInput({ name: "List Z", type: "income", sortOrder: 9 }),
        { userId: userA },
      );
      await service.create(
        categoryInput({ name: "List A", type: "income", sortOrder: 1 }),
        { userId: userA },
      );
      await service.create(
        categoryInput({ name: "List B", type: "expense", sortOrder: 2 }),
        { userId: userA },
      );
      const income = await service.list(userA, { type: "income" });
      expect(income.every((c) => c.type === "income")).toBe(true);
      const sorted = income.every(
        (c, i, arr) => i === 0 || arr[i - 1]!.sortOrder <= c.sortOrder,
      );
      expect(sorted).toBe(true);
      const expense = await service.list(userA, { type: "expense" });
      expect(expense.every((c) => c.type === "expense")).toBe(true);
    });

    it("includes soft-deleted categories in the list", async () => {
      const category = await service.create(
        categoryInput({ name: "List Deleted" }),
        { userId: userA },
      );
      await service.softDelete(userA, category.id, userA);
      const all = await service.list(userA, {});
      const found = all.find((c) => c.id === category.id);
      expect(found?.deleted).toBe(true);
    });

    it("isolates lists between users", async () => {
      await service.create(categoryInput({ name: "Only Mine" }), {
        userId: userA,
      });
      const theirs = await service.list(userB, {});
      expect(theirs.some((c) => c.name === "Only Mine")).toBe(false);
    });
  });

  describe("softDelete", () => {
    it("soft-deletes an unused category and populates delete metadata", async () => {
      const category = await service.create(
        categoryInput({ name: "Unused Delete" }),
        { userId: userA },
      );
      await service.softDelete(userA, category.id, userA);
      const deleted = await categoryRepository.findById(userA, category.id);
      expect(deleted?.deletedAt).not.toBeNull();
      expect(deleted?.deletedBy).toBe(userA);
      expect(deleted?.rev).toBe(category.rev + 1);
      expect(deleted?.isDefault).toBe(false);
    });

    it("throws CATEGORY_IN_USE when referenced without reassign", async () => {
      const category = await service.create(
        categoryInput({ name: "In Use" }),
        { userId: userA },
      );
      await transactionRepository.create(txInput(userA, category.id));
      await expect(
        service.softDelete(userA, category.id, userA),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: ErrorCodes.CategoryInUse,
      });
      const stillThere = await categoryRepository.findById(userA, category.id);
      expect(stillThere?.deletedAt).toBeNull();
    });

    it("reassigns transactions to a target without edit metadata", async () => {
      const source = await service.create(
        categoryInput({ name: "Reassign Source" }),
        { userId: userA },
      );
      const target = await service.create(
        categoryInput({ name: "Reassign Target" }),
        { userId: userA },
      );
      const tx = await transactionRepository.create(txInput(userA, source.id));
      await service.softDelete(userA, source.id, userA, target.id);
      const doc = await TransactionModel.findOne({ _id: tx.id }).exec();
      expect(doc?.categoryId?.toString()).toBe(target.id);
      expect(doc?.rev).toBe(1);
      expect(doc?.editedCount).toBe(0);
      expect(doc?.editedAt).toBeNull();
    });

    it("clears parentId on child categories when parent is deleted", async () => {
      const parent = await service.create(
        categoryInput({ name: "Parent To Delete" }),
        { userId: userA },
      );
      const child = await service.create(
        categoryInput({ name: "Child Orphan", parentId: parent.id }),
        { userId: userA },
      );
      await service.softDelete(userA, parent.id, userA);
      const reloaded = await service.findById(userA, child.id);
      expect(reloaded?.parentId).toBeNull();
    });

    it("rejects reassigning to another user's category", async () => {
      const source = await service.create(
        categoryInput({ name: "Wrong User Source" }),
        { userId: userA },
      );
      const foreignTarget = await service.create(
        categoryInput({ name: "Wrong User Target" }),
        { userId: userB },
      );
      await expect(
        service.softDelete(userA, source.id, userA, foreignTarget.id),
      ).rejects.toMatchObject({ statusCode: 422 });
    });

    it("rejects reassigning to a different-type target", async () => {
      const source = await service.create(
        categoryInput({ name: "Type Source" }),
        { userId: userA },
      );
      const incomeTarget = await service.create(
        categoryInput({ name: "Income Target", type: "income" }),
        { userId: userA },
      );
      await expect(
        service.softDelete(userA, source.id, userA, incomeTarget.id),
      ).rejects.toMatchObject({ statusCode: 422 });
    });

    it("rejects reassigning to itself", async () => {
      const source = await service.create(
        categoryInput({ name: "Self Reassign" }),
        { userId: userA },
      );
      await expect(
        service.softDelete(userA, source.id, userA, source.id),
      ).rejects.toMatchObject({ statusCode: 422 });
    });

    it("clears a default on delete without promoting another", async () => {
      const def = await service.create(
        categoryInput({
          name: "Default To Delete",
          isDefault: true,
          type: "income",
        }),
        { userId: userA },
      );
      const other = await service.create(
        categoryInput({ name: "Not Promoted", type: "income" }),
        { userId: userA },
      );
      await service.softDelete(userA, def.id, userA);
      const reloadedOther = await service.findById(userA, other.id);
      expect(reloadedOther?.isDefault).toBe(false);
    });
  });

  describe("reassign transactions", () => {
    it("reassigns only the same user's transactions", async () => {
      const sourceA = await service.create(
        categoryInput({ name: "Scope Source A" }),
        { userId: userA },
      );
      const targetA = await service.create(
        categoryInput({ name: "Scope Target A" }),
        { userId: userA },
      );
      const sourceB = await service.create(
        categoryInput({ name: "Scope Source B" }),
        { userId: userB },
      );
      const txA = await transactionRepository.create(txInput(userA, sourceA.id));
      const txB = await transactionRepository.create(txInput(userB, sourceB.id));
      await service.softDelete(userA, sourceA.id, userA, targetA.id);
      const reloadedA = await transactionRepository.findById(userA, txA.id);
      const reloadedB = await transactionRepository.findById(userB, txB.id);
      expect(reloadedA?.categoryId).toBe(targetA.id);
      expect(reloadedB?.categoryId).toBe(sourceB.id);
    });

    it("leaves soft-deleted transactions untouched", async () => {
      const source = await service.create(
        categoryInput({ name: "Keep Deleted Tx" }),
        { userId: userA },
      );
      const target = await service.create(
        categoryInput({ name: "Keep Deleted Target" }),
        { userId: userA },
      );
      const tx = await transactionRepository.create(txInput(userA, source.id));
      await transactionRepository.softDelete(userA, tx.id, userA);
      await service.softDelete(userA, source.id, userA, target.id);
      const doc = await TransactionModel.findOne({ _id: tx.id }).exec();
      expect(doc?.categoryId?.toString()).toBe(source.id);
      expect(doc?.deletedAt).not.toBeNull();
    });
  });

  describe("restoreDefaults", () => {
    it("creates the catalog for a new user", async () => {
      const categories = await service.restoreDefaults(userC);
      expect(categories.length).toBe(23);
      const all = await service.list(userC, {});
      expect(all.length).toBe(23);
      for (const category of all) {
        expect(category.isPreset).toBe(true);
        expect(category.status).toBe("active");
        expect(category.deleted).toBe(false);
      }
      const salary = all.find((c) => c.name === "Salary");
      const food = all.find((c) => c.name === "Food & Dining");
      expect(salary?.isDefault).toBe(true);
      expect(food?.isDefault).toBe(true);
    });

    it("is idempotent on repeated calls", async () => {
      await service.restoreDefaults(userC);
      await service.restoreDefaults(userC);
      const all = await service.list(userC, {});
      expect(all.length).toBe(23);
    });

    it("does not duplicate existing categories", async () => {
      const existing = await service.create(
        categoryInput({ name: "Groceries", type: "expense" }),
        { userId: userD },
      );
      await service.restoreDefaults(userD);
      const all = await service.list(userD, {});
      expect(all.filter((c) => c.name === "Groceries").length).toBe(1);
      const reloaded = await service.findById(userD, existing.id);
      expect(reloaded?.isPreset).toBe(false);
    });

    it("preserves an existing user-selected default", async () => {
      const custom = await service.create(
        categoryInput({
          name: "My Income",
          type: "income",
          isDefault: true,
        }),
        { userId: userE },
      );
      await service.restoreDefaults(userE);
      const reloaded = await service.findById(userE, custom.id);
      expect(reloaded?.isDefault).toBe(true);
      const salary = (await service.list(userE, { type: "income" })).find(
        (c) => c.name === "Salary",
      );
      expect(salary?.isDefault).toBe(false);
    });
  });
});
