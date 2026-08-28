import { describe, expect, it } from "vitest";
import {
  DEFAULT_CATEGORY_CATALOG,
  isCategoryTypeCompatible,
} from "@moneytalks/shared";
import type { CategoryType, TransactionType } from "@moneytalks/shared";

describe("isCategoryTypeCompatible", () => {
  it.each<[TransactionType, CategoryType, boolean]>([
    ["income", "income", true],
    ["income", "expense", false],
    ["expense", "expense", true],
    ["expense", "income", false],
    ["refund", "expense", true],
    ["refund", "income", false],
    ["transfer", "transfer", true],
    ["transfer", "expense", false],
    ["adjustment", "income", true],
    ["adjustment", "expense", true],
    ["adjustment", "transfer", true],
  ])(
    "transaction %s → category %s is %s",
    (transactionType, categoryType, expected) => {
      expect(isCategoryTypeCompatible(transactionType, categoryType)).toBe(
        expected,
      );
    },
  );
});

describe("DEFAULT_CATEGORY_CATALOG", () => {
  it("contains both income and expense categories", () => {
    const types = new Set(DEFAULT_CATEGORY_CATALOG.map((c) => c.type));
    expect(types).toEqual(new Set(["income", "expense"]));
    expect(types).not.toContain("transfer");
  });

  it("marks every entry as an active preset", () => {
    for (const category of DEFAULT_CATEGORY_CATALOG) {
      expect(category.isPreset).toBe(true);
      expect(category.status).toBe("active");
    }
  });

  it("marks Salary as the default income category", () => {
    const incomeDefault = DEFAULT_CATEGORY_CATALOG.filter(
      (c) => c.type === "income" && c.isDefault,
    );
    expect(incomeDefault).toHaveLength(1);
    expect(incomeDefault[0]?.name).toBe("Salary");
  });

  it("marks Food & Dining as the default expense category", () => {
    const expenseDefault = DEFAULT_CATEGORY_CATALOG.filter(
      (c) => c.type === "expense" && c.isDefault,
    );
    expect(expenseDefault).toHaveLength(1);
    expect(expenseDefault[0]?.name).toBe("Food & Dining");
  });

  it("assigns deterministic sequential sortOrder per type", () => {
    const income = DEFAULT_CATEGORY_CATALOG.filter((c) => c.type === "income");
    const expense = DEFAULT_CATEGORY_CATALOG.filter((c) => c.type === "expense");
    expect(income.map((c) => c.sortOrder)).toEqual(
      income.map((_, i) => i),
    );
    expect(expense.map((c) => c.sortOrder)).toEqual(
      expense.map((_, i) => i),
    );
  });
});
