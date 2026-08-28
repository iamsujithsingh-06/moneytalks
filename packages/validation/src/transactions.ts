import { z } from "zod";
import {
  CategorizedBy,
  MINOR_AMOUNT_MAX,
  SUPPORTED_CURRENCIES,
  TransactionDirection,
  TransactionSource,
  TransactionStatus,
  TransactionType,
  isValidCalendarDay,
  isPositiveMinorUnitsAmount,
} from "@moneytalks/shared";

export const transactionTypeSchema = z.enum(
  [
    TransactionType.Income,
    TransactionType.Expense,
    TransactionType.Refund,
    TransactionType.Transfer,
    TransactionType.Adjustment,
  ],
  {
    errorMap: () => ({
      message: "type must be one of income, expense, refund, transfer, adjustment",
    }),
  },
);

export const transactionSourceSchema = z.enum(
  [
    TransactionSource.Manual,
    TransactionSource.Sms,
    TransactionSource.Import,
    TransactionSource.Ocr,
  ],
  {
    errorMap: () => ({ message: "source must be one of manual, sms, import, ocr" }),
  },
);

export const transactionStatusSchema = z.enum(
  [
    TransactionStatus.Pending,
    TransactionStatus.Confirmed,
    TransactionStatus.Rejected,
  ],
  {
    errorMap: () => ({ message: "status must be one of pending, confirmed, rejected" }),
  },
);

export const transactionDirectionSchema = z.enum(
  [TransactionDirection.Inflow, TransactionDirection.Outflow],
  {
    errorMap: () => ({ message: "direction must be 'inflow' or 'outflow'" }),
  },
);

export const amountMinorSchema = z
  .number({
    required_error: "amountMinor is required",
    invalid_type_error: "amountMinor must be a number",
  })
  .refine(
    isPositiveMinorUnitsAmount,
    "amountMinor must be a positive integer in minor units",
  );

export const currencySchema = z
  .string({ required_error: "currency is required" })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "currency must be a 3-letter ISO 4217 code")
  .refine(
    (value) => (SUPPORTED_CURRENCIES as readonly string[]).includes(value),
    "currency is not a supported currency",
  );

export const transactionDateSchema = z
  .string({ required_error: "transactionDate is required" })
  .refine(
    (value) => {
      const match = /^(\d{4}-\d{2}-\d{2})(T.*)?$/.exec(value);
      if (!match) return false;
      const day = match[1];
      if (!day || !isValidCalendarDay(day)) return false;
      return match[2] === undefined || !Number.isNaN(Date.parse(value));
    },
    "transactionDate must be a valid ISO 8601 date",
  );

export const clientIdSchema = z
  .string({ required_error: "clientId is required" })
  .trim()
  .uuid("clientId must be a UUID");

export const fingerprintSchema = z
  .string()
  .trim()
  .min(1, "fingerprint is invalid")
  .max(128, "fingerprint is invalid");

export const merchantSchema = z
  .string()
  .trim()
  .max(200, "merchant must be at most 200 characters")
  .optional();

export const counterpartySchema = z
  .string()
  .trim()
  .max(200, "counterparty must be at most 200 characters")
  .optional();

export const noteSchema = z
  .string()
  .trim()
  .max(500, "note must be at most 500 characters")
  .optional();

export const tagsSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, "tag must not be empty")
      .max(40, "tag must be at most 40 characters"),
  )
  .max(20, "at most 20 tags are allowed")
  .optional();

export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-f]{24}$/, "must be a valid ObjectId");

export const categoryIdSchema = objectIdSchema.optional();
export const paymentMethodIdSchema = objectIdSchema.optional();

export const accountRefSchema = z
  .string()
  .trim()
  .max(80, "accountRef must be at most 80 characters")
  .optional();

export const categorizedBySchema = z
  .enum(
    [
      CategorizedBy.Manual,
      CategorizedBy.Rule,
      CategorizedBy.Ai,
      CategorizedBy.Default,
    ],
    { errorMap: () => ({ message: "categorizedBy is invalid" }) },
  )
  .nullable()
  .optional();

export const confidenceSchema = z
  .number()
  .min(0, "confidence must be between 0 and 1")
  .max(1, "confidence must be between 0 and 1")
  .optional();

export const createTransactionSchema = z
  .object({
    clientId: clientIdSchema,
    type: transactionTypeSchema,
    amountMinor: amountMinorSchema,
    currency: currencySchema.default("INR"),
    transactionDate: transactionDateSchema,
    source: transactionSourceSchema.default(TransactionSource.Manual),
    status: transactionStatusSchema.default(TransactionStatus.Confirmed),
    direction: transactionDirectionSchema.optional(),
    merchant: merchantSchema,
    counterparty: counterpartySchema,
    note: noteSchema,
    tags: tagsSchema,
    categoryId: categoryIdSchema,
    paymentMethodId: paymentMethodIdSchema,
    accountRef: accountRefSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const directionAllowed =
      value.type === TransactionType.Transfer ||
      value.type === TransactionType.Adjustment;
    if (value.direction !== undefined && !directionAllowed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["direction"],
        message:
          "direction is derived from type and must not be provided for this type",
      });
    }
  });

export const updateTransactionSchema = z
  .object({
    type: transactionTypeSchema.optional(),
    status: transactionStatusSchema.optional(),
    direction: transactionDirectionSchema.optional(),
    amountMinor: amountMinorSchema.optional(),
    currency: currencySchema.optional(),
    transactionDate: transactionDateSchema.optional(),
    merchant: z
      .string()
      .trim()
      .max(200, "merchant must be at most 200 characters")
      .nullable()
      .optional(),
    counterparty: z
      .string()
      .trim()
      .max(200, "counterparty must be at most 200 characters")
      .nullable()
      .optional(),
    note: z
      .string()
      .trim()
      .max(500, "note must be at most 500 characters")
      .nullable()
      .optional(),
    tags: tagsSchema,
    categoryId: objectIdSchema.nullable().optional(),
    paymentMethodId: objectIdSchema.nullable().optional(),
    accountRef: z
      .string()
      .trim()
      .max(80, "accountRef must be at most 80 characters")
      .nullable()
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "at least one field must be provided",
  })
  .superRefine((value, ctx) => {
    const directionAllowed =
      value.type === TransactionType.Transfer ||
      value.type === TransactionType.Adjustment;
    if (
      value.direction !== undefined &&
      value.type !== undefined &&
      !directionAllowed
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["direction"],
        message:
          "direction is derived from type and must not be provided for this type",
      });
    }
  });

const calendarDayQuerySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date in YYYY-MM-DD format")
  .refine(isValidCalendarDay, "must be a valid calendar day");

const queryAmountMinorSchema = z.coerce
  .number()
  .refine(
    isPositiveMinorUnitsAmount,
    "must be a positive integer in minor units",
  );

const tagsQuerySchema = z.preprocess(
  (value) => {
    if (value === undefined) return undefined;
    const parts = Array.isArray(value)
      ? value
      : String(value)
          .split(",")
          .map((part) => part.trim())
          .filter((part) => part.length > 0);
    return parts;
  },
  z
    .array(
      z
        .string()
        .trim()
        .min(1, "tag must not be empty")
        .max(40, "tag must be at most 40 characters"),
    )
    .max(20, "at most 20 tags are allowed"),
);

export const transactionListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().trim().min(1).optional(),
    q: z.string().trim().max(200, "q must be at most 200 characters").optional(),
    type: transactionTypeSchema.optional(),
    source: transactionSourceSchema.optional(),
    status: transactionStatusSchema.optional(),
    direction: transactionDirectionSchema.optional(),
    categoryId: objectIdSchema.optional(),
    paymentMethodId: objectIdSchema.optional(),
    from: calendarDayQuerySchema.optional(),
    to: calendarDayQuerySchema.optional(),
    minAmount: queryAmountMinorSchema.optional(),
    maxAmount: queryAmountMinorSchema.optional(),
    merchant: z.string().trim().max(200).optional(),
    tags: tagsQuerySchema.optional(),
    duplicatesOnly: z
      .enum(["true", "false"])
      .optional()
      .transform((value) =>
        value === undefined ? undefined : value === "true",
      ),
  })
  .strict();

export const transactionParamsSchema = z
  .object({
    id: objectIdSchema,
  })
  .strict();

export type CreateTransactionInput = z.input<typeof createTransactionSchema>;
export type CreateTransactionData = z.output<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.input<typeof updateTransactionSchema>;
export type UpdateTransactionData = z.output<typeof updateTransactionSchema>;
export type TransactionListQueryInput = z.input<
  typeof transactionListQuerySchema
>;
export type TransactionListQueryData = z.output<
  typeof transactionListQuerySchema
>;
export type TransactionParams = z.output<typeof transactionParamsSchema>;

export { MINOR_AMOUNT_MAX };
