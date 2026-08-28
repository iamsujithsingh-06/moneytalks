import { z } from "zod";
import {
  CategoryType,
  EntityStatus,
  PaymentMethodKind,
} from "@moneytalks/shared";
import {
  accountRefSchema,
  clientIdSchema,
  objectIdSchema,
} from "./transactions.js";

export const categoryNameSchema = z
  .string()
  .trim()
  .min(1, "name must not be empty")
  .max(60, "name must be at most 60 characters");

export const categoryTypeSchema = z.enum(
  [CategoryType.Income, CategoryType.Expense, CategoryType.Transfer],
  {
    errorMap: () => ({
      message: "type must be one of income, expense, transfer",
    }),
  },
);

export const categoryStatusSchema = z.enum(
  [EntityStatus.Active, EntityStatus.Archived],
  {
    errorMap: () => ({ message: "status must be one of active, archived" }),
  },
);

export const iconSchema = z
  .string()
  .trim()
  .max(50, "icon must be at most 50 characters")
  .optional();

export const colorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "color must be a 6-digit hex color")
  .optional();

export const parentIdSchema = objectIdSchema.nullable().optional();

export const sortOrderSchema = z
  .number()
  .int("sortOrder must be an integer")
  .min(0, "sortOrder must be at least 0");

export const isDefaultSchema = z.boolean();

export const createCategorySchema = z
  .object({
    clientId: clientIdSchema,
    name: categoryNameSchema,
    type: categoryTypeSchema,
    icon: iconSchema,
    color: colorSchema,
    parentId: parentIdSchema,
    sortOrder: sortOrderSchema.optional(),
    isDefault: isDefaultSchema.optional(),
  })
  .strict();

export const updateCategorySchema = z
  .object({
    name: categoryNameSchema.optional(),
    icon: iconSchema,
    color: colorSchema,
    parentId: parentIdSchema,
    sortOrder: sortOrderSchema.optional(),
    status: categoryStatusSchema.optional(),
    isDefault: isDefaultSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "at least one field must be provided",
  });

export const categoryParamsSchema = z
  .object({
    id: objectIdSchema,
  })
  .strict();

export const categoryDeleteSchema = z
  .object({
    reassignToId: objectIdSchema.optional(),
  })
  .strict();

export const categoryListQuerySchema = z
  .object({
    type: categoryTypeSchema.optional(),
  })
  .strict();

export const paymentMethodKindSchema = z.enum(
  [
    PaymentMethodKind.Upi,
    PaymentMethodKind.Card,
    PaymentMethodKind.Bank,
    PaymentMethodKind.Wallet,
  ],
  {
    errorMap: () => ({
      message: "kind must be one of upi, card, bank, wallet",
    }),
  },
);

export const paymentMethodNameSchema = z
  .string()
  .trim()
  .min(1, "name must not be empty")
  .max(60, "name must be at most 60 characters");

export const providerSchema = z
  .string()
  .trim()
  .max(60, "provider must be at most 60 characters")
  .optional();

export const maskedNumberSchema = z
  .string()
  .trim()
  .max(20, "maskedNumber must be at most 20 characters")
  .optional();

export const createPaymentMethodSchema = z
  .object({
    clientId: clientIdSchema,
    name: paymentMethodNameSchema,
    kind: paymentMethodKindSchema,
    provider: providerSchema,
    maskedNumber: maskedNumberSchema,
    accountRef: accountRefSchema,
    isDefault: isDefaultSchema.optional(),
  })
  .strict();

export const updatePaymentMethodSchema = z
  .object({
    name: paymentMethodNameSchema.optional(),
    provider: providerSchema,
    maskedNumber: maskedNumberSchema,
    accountRef: accountRefSchema,
    isDefault: isDefaultSchema.optional(),
    status: categoryStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "at least one field must be provided",
  });

export const paymentMethodParamsSchema = z
  .object({
    id: objectIdSchema,
  })
  .strict();

export const paymentMethodListQuerySchema = z
  .object({
    kind: paymentMethodKindSchema.optional(),
  })
  .strict();

export type CreateCategoryInput = z.input<typeof createCategorySchema>;
export type CreateCategoryData = z.output<typeof createCategorySchema>;
export type UpdateCategoryInput = z.input<typeof updateCategorySchema>;
export type UpdateCategoryData = z.output<typeof updateCategorySchema>;
export type CategoryListQuery = z.output<typeof categoryListQuerySchema>;
export type CategoryParams = z.output<typeof categoryParamsSchema>;
export type CategoryDeleteInput = z.input<typeof categoryDeleteSchema>;
export type CreatePaymentMethodInput = z.input<typeof createPaymentMethodSchema>;
export type CreatePaymentMethodData = z.output<typeof createPaymentMethodSchema>;
export type UpdatePaymentMethodInput = z.input<typeof updatePaymentMethodSchema>;
export type UpdatePaymentMethodData = z.output<typeof updatePaymentMethodSchema>;
export type PaymentMethodListQuery = z.output<
  typeof paymentMethodListQuerySchema
>;
export type PaymentMethodParams = z.output<typeof paymentMethodParamsSchema>;
