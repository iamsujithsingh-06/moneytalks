import { describe, expect, it } from "vitest";
import {
  categoryDeleteSchema,
  categoryListQuerySchema,
  categoryParamsSchema,
  createCategorySchema,
  createPaymentMethodSchema,
  paymentMethodListQuerySchema,
  paymentMethodParamsSchema,
  updateCategorySchema,
  updatePaymentMethodSchema,
} from "@moneytalks/validation";

const validCategoryCreate = {
  clientId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  name: "Food & Dining",
  type: "expense",
};

const validPaymentMethodCreate = {
  clientId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  name: "HDFC Debit Card",
  kind: "card",
};

describe("createCategorySchema", () => {
  it("parses a valid create payload", () => {
    const result = createCategorySchema.safeParse(validCategoryCreate);
    expect(result.success).toBe(true);
  });

  it("trims names", () => {
    const result = createCategorySchema.safeParse({
      ...validCategoryCreate,
      name: "  Salary  ",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.name).toBe("Salary");
  });

  it("rejects empty names", () => {
    for (const name of ["", "   "]) {
      const result = createCategorySchema.safeParse({
        ...validCategoryCreate,
        name,
      });
      expect(result.success).toBe(false);
    }
  });

  it("rejects names longer than 60 characters", () => {
    const result = createCategorySchema.safeParse({
      ...validCategoryCreate,
      name: "x".repeat(61),
    });
    expect(result.success).toBe(false);
  });

  it("accepts every category type", () => {
    for (const type of ["income", "expense", "transfer"]) {
      const result = createCategorySchema.safeParse({
        ...validCategoryCreate,
        type,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects an invalid category type", () => {
    const result = createCategorySchema.safeParse({
      ...validCategoryCreate,
      type: "gift",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid color", () => {
    const result = createCategorySchema.safeParse({
      ...validCategoryCreate,
      color: "#A1b2C3",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid color", () => {
    for (const color of ["red", "#12", "#gggggg", "#12345"]) {
      const result = createCategorySchema.safeParse({
        ...validCategoryCreate,
        color,
      });
      expect(result.success).toBe(false);
    }
  });

  it("accepts a valid or null parentId", () => {
    expect(
      createCategorySchema.safeParse({
        ...validCategoryCreate,
        parentId: "aaaaaaaaaaaaaaaaaaaaaaaa",
      }).success,
    ).toBe(true);
    expect(
      createCategorySchema.safeParse({
        ...validCategoryCreate,
        parentId: null,
      }).success,
    ).toBe(true);
  });

  it("rejects an invalid parentId", () => {
    const result = createCategorySchema.safeParse({
      ...validCategoryCreate,
      parentId: "not-an-object-id",
    });
    expect(result.success).toBe(false);
  });

  it("requires sortOrder to be an integer >= 0", () => {
    expect(
      createCategorySchema.safeParse({ ...validCategoryCreate, sortOrder: 0 })
        .success,
    ).toBe(true);
    expect(
      createCategorySchema.safeParse({ ...validCategoryCreate, sortOrder: 7 })
        .success,
    ).toBe(true);
    expect(
      createCategorySchema.safeParse({ ...validCategoryCreate, sortOrder: -1 })
        .success,
    ).toBe(false);
    expect(
      createCategorySchema.safeParse({ ...validCategoryCreate, sortOrder: 1.5 })
        .success,
    ).toBe(false);
    expect(
      createCategorySchema.safeParse({ ...validCategoryCreate, sortOrder: "3" })
        .success,
    ).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    const result = createCategorySchema.safeParse({
      ...validCategoryCreate,
      bogus: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects server-controlled fields", () => {
    for (const key of [
      "userId",
      "isPreset",
      "status",
      "deletedAt",
      "deletedBy",
      "rev",
      "createdAt",
      "updatedAt",
    ]) {
      const result = createCategorySchema.safeParse({
        ...validCategoryCreate,
        [key]: true,
      });
      expect(result.success).toBe(false);
    }
  });
});

describe("updateCategorySchema", () => {
  it("parses a valid partial update", () => {
    const result = updateCategorySchema.safeParse({
      name: "Renamed",
      status: "archived",
      sortOrder: 3,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.name).toBe("Renamed");
    expect(result.data.status).toBe("archived");
  });

  it("rejects an empty update", () => {
    const result = updateCategorySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects immutable and server-controlled fields", () => {
    for (const key of [
      "userId",
      "clientId",
      "type",
      "isPreset",
      "deletedAt",
      "deletedBy",
      "rev",
      "createdAt",
      "updatedAt",
    ]) {
      const result = updateCategorySchema.safeParse({
        name: "Renamed",
        [key]: true,
      });
      expect(result.success).toBe(false);
    }
  });
});

describe("category params, delete and list query", () => {
  it("parses a valid id param", () => {
    expect(
      categoryParamsSchema.safeParse({ id: "aaaaaaaaaaaaaaaaaaaaaaaa" }).success,
    ).toBe(true);
  });

  it("parses a valid delete payload", () => {
    expect(categoryDeleteSchema.safeParse({}).success).toBe(true);
    expect(
      categoryDeleteSchema.safeParse({
        reassignToId: "aaaaaaaaaaaaaaaaaaaaaaaa",
      }).success,
    ).toBe(true);
  });

  it("rejects an invalid reassignToId", () => {
    const result = categoryDeleteSchema.safeParse({
      reassignToId: "nope",
    });
    expect(result.success).toBe(false);
  });

  it("parses a valid list query", () => {
    expect(categoryListQuerySchema.safeParse({}).success).toBe(true);
    expect(categoryListQuerySchema.safeParse({ type: "income" }).success).toBe(
      true,
    );
  });

  it("rejects an invalid list type", () => {
    const result = categoryListQuerySchema.safeParse({ type: "gift" });
    expect(result.success).toBe(false);
  });
});

describe("createPaymentMethodSchema", () => {
  it("parses a valid create payload", () => {
    const result = createPaymentMethodSchema.safeParse(validPaymentMethodCreate);
    expect(result.success).toBe(true);
  });

  it("trims names", () => {
    const result = createPaymentMethodSchema.safeParse({
      ...validPaymentMethodCreate,
      name: "  UPI  ",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.name).toBe("UPI");
  });

  it("rejects empty names", () => {
    for (const name of ["", "   "]) {
      const result = createPaymentMethodSchema.safeParse({
        ...validPaymentMethodCreate,
        name,
      });
      expect(result.success).toBe(false);
    }
  });

  it("rejects names longer than 60 characters", () => {
    const result = createPaymentMethodSchema.safeParse({
      ...validPaymentMethodCreate,
      name: "x".repeat(61),
    });
    expect(result.success).toBe(false);
  });

  it("accepts every payment method kind", () => {
    for (const kind of ["upi", "card", "bank", "wallet"]) {
      const result = createPaymentMethodSchema.safeParse({
        ...validPaymentMethodCreate,
        kind,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects an invalid kind", () => {
    const result = createPaymentMethodSchema.safeParse({
      ...validPaymentMethodCreate,
      kind: "cash",
    });
    expect(result.success).toBe(false);
  });

  it("enforces field max lengths", () => {
    expect(
      createPaymentMethodSchema.safeParse({
        ...validPaymentMethodCreate,
        provider: "x".repeat(60),
      }).success,
    ).toBe(true);
    expect(
      createPaymentMethodSchema.safeParse({
        ...validPaymentMethodCreate,
        provider: "x".repeat(61),
      }).success,
    ).toBe(false);
    expect(
      createPaymentMethodSchema.safeParse({
        ...validPaymentMethodCreate,
        maskedNumber: "x".repeat(20),
      }).success,
    ).toBe(true);
    expect(
      createPaymentMethodSchema.safeParse({
        ...validPaymentMethodCreate,
        maskedNumber: "x".repeat(21),
      }).success,
    ).toBe(false);
    expect(
      createPaymentMethodSchema.safeParse({
        ...validPaymentMethodCreate,
        accountRef: "x".repeat(80),
      }).success,
    ).toBe(true);
    expect(
      createPaymentMethodSchema.safeParse({
        ...validPaymentMethodCreate,
        accountRef: "x".repeat(81),
      }).success,
    ).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    const result = createPaymentMethodSchema.safeParse({
      ...validPaymentMethodCreate,
      bogus: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects server/internal fields", () => {
    for (const key of [
      "userId",
      "status",
      "deletedAt",
      "deletedBy",
      "rev",
      "createdAt",
      "updatedAt",
    ]) {
      const result = createPaymentMethodSchema.safeParse({
        ...validPaymentMethodCreate,
        [key]: true,
      });
      expect(result.success).toBe(false);
    }
  });
});

describe("updatePaymentMethodSchema", () => {
  it("parses a valid partial update", () => {
    const result = updatePaymentMethodSchema.safeParse({
      name: "Renamed",
      isDefault: true,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.isDefault).toBe(true);
  });

  it("rejects an empty update", () => {
    const result = updatePaymentMethodSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects the immutable kind and other internal fields", () => {
    for (const key of [
      "kind",
      "clientId",
      "userId",
      "deletedAt",
      "deletedBy",
      "rev",
      "createdAt",
      "updatedAt",
    ]) {
      const result = updatePaymentMethodSchema.safeParse({
        name: "Renamed",
        [key]: key === "kind" ? "bank" : true,
      });
      expect(result.success).toBe(false);
    }
  });
});

describe("payment method params and list query", () => {
  it("parses a valid id param", () => {
    expect(
      paymentMethodParamsSchema.safeParse({ id: "aaaaaaaaaaaaaaaaaaaaaaaa" })
        .success,
    ).toBe(true);
  });

  it("parses a valid list query", () => {
    expect(paymentMethodListQuerySchema.safeParse({}).success).toBe(true);
    expect(paymentMethodListQuerySchema.safeParse({ kind: "upi" }).success).toBe(
      true,
    );
  });

  it("rejects an invalid list kind", () => {
    const result = paymentMethodListQuerySchema.safeParse({ kind: "cash" });
    expect(result.success).toBe(false);
  });
});
