import { describe, expect, it } from "vitest";
import { createTransactionSchema } from "@moneytalks/validation";

const validInput = {
  clientId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  type: "expense",
  amountMinor: 45000,
  transactionDate: "2026-01-05",
};

describe("createTransactionSchema", () => {
  it("parses a valid create payload with defaults applied", () => {
    const result = createTransactionSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.source).toBe("manual");
    expect(result.data.status).toBe("confirmed");
    expect(result.data.currency).toBe("INR");
  });

  it("parses a fully-populated payload", () => {
    const result = createTransactionSchema.safeParse({
      ...validInput,
      currency: "usd",
      source: "import",
      status: "pending",
      merchant: "Amazon",
      counterparty: "Amazon Pay",
      note: "monthly order",
      tags: ["shopping", "recurring"],
      categoryId: "aaaaaaaaaaaaaaaaaaaaaaaa",
      paymentMethodId: "bbbbbbbbbbbbbbbbbbbbbbbb",
      accountRef: "*1234",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.currency).toBe("USD");
    expect(result.data.source).toBe("import");
    expect(result.data.status).toBe("pending");
  });

  it("rejects an invalid type", () => {
    const result = createTransactionSchema.safeParse({
      ...validInput,
      type: "reimbursement",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-positive or fractional amountMinor", () => {
    for (const amountMinor of [0, -1, 1.5, Number.NaN]) {
      const result = createTransactionSchema.safeParse({
        ...validInput,
        amountMinor,
      });
      expect(result.success).toBe(false);
    }
  });

  it("rejects an unsupported currency", () => {
    const result = createTransactionSchema.safeParse({
      ...validInput,
      currency: "ZZZ",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid transactionDate", () => {
    for (const transactionDate of ["not-a-date", "2026-02-30", "05-01-2026"]) {
      const result = createTransactionSchema.safeParse({
        ...validInput,
        transactionDate,
      });
      expect(result.success).toBe(false);
    }
  });

  it("rejects payloads missing required fields", () => {
    for (const key of ["clientId", "type", "amountMinor", "transactionDate"]) {
      const input = { ...validInput };
      delete input[key as keyof typeof input];
      const result = createTransactionSchema.safeParse(input);
      expect(result.success).toBe(false);
    }
  });

  it("rejects a non-UUID clientId", () => {
    const result = createTransactionSchema.safeParse({
      ...validInput,
      clientId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    const result = createTransactionSchema.safeParse({
      ...validInput,
      bogus: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects direction for types that derive it", () => {
    const result = createTransactionSchema.safeParse({
      ...validInput,
      type: "income",
      direction: "inflow",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path[0] === "direction")).toBe(
      true,
    );
  });

  it("allows explicit direction for transfer and adjustment", () => {
    expect(
      createTransactionSchema.safeParse({
        ...validInput,
        type: "transfer",
        direction: "outflow",
      }).success,
    ).toBe(true);
    expect(
      createTransactionSchema.safeParse({
        ...validInput,
        type: "adjustment",
        direction: "inflow",
      }).success,
    ).toBe(true);
  });

  it("rejects invalid ObjectId references and malformed tags", () => {
    expect(
      createTransactionSchema.safeParse({
        ...validInput,
        categoryId: "nope",
      }).success,
    ).toBe(false);
    expect(
      createTransactionSchema.safeParse({ ...validInput, tags: [""] }).success,
    ).toBe(false);
    expect(
      createTransactionSchema.safeParse({
        ...validInput,
        tags: Array.from({ length: 21 }, () => "x"),
      }).success,
    ).toBe(false);
  });
});
