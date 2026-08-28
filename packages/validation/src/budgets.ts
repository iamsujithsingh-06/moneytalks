import { z } from "zod";
import {
  BudgetPeriod,
  BudgetScope,
  BudgetStatus,
  isValidCalendarDay,
} from "@moneytalks/shared";
import {
  amountMinorSchema,
  clientIdSchema,
  currencySchema,
  objectIdSchema,
} from "./transactions.js";

export const DEFAULT_ALERT_THRESHOLDS = {
  warningPct: 80,
  hardPct: 100,
} as const;

export const budgetScopeSchema = z.enum(
  [BudgetScope.Category, BudgetScope.Overall],
  {
    errorMap: () => ({ message: "scope must be one of category, overall" }),
  },
);

export const budgetPeriodSchema = z.enum(
  [
    BudgetPeriod.Weekly,
    BudgetPeriod.Monthly,
    BudgetPeriod.Yearly,
    BudgetPeriod.Custom,
  ],
  {
    errorMap: () => ({
      message: "period must be one of weekly, monthly, yearly, custom",
    }),
  },
);

export const budgetStatusSchema = z.enum(
  [BudgetStatus.Active, BudgetStatus.Paused, BudgetStatus.Completed],
  {
    errorMap: () => ({
      message: "status must be one of active, paused, completed",
    }),
  },
);

const alertThresholdsSchema = z
  .object({
    warningPct: z
      .number()
      .int("warningPct must be an integer")
      .min(1, "warningPct must be at least 1")
      .max(100, "warningPct must be at most 100"),
    hardPct: z
      .number()
      .int("hardPct must be an integer")
      .min(1, "hardPct must be at least 1")
      .max(100, "hardPct must be at most 100"),
  })
  .strict()
  .refine((value) => value.hardPct >= value.warningPct, {
    message: "hardPct must be greater than or equal to warningPct",
    path: ["hardPct"],
  });

export const budgetDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date in YYYY-MM-DD format")
  .refine(isValidCalendarDay, "must be a valid calendar day");

export const createBudgetSchema = z
  .object({
    clientId: clientIdSchema,
    scope: budgetScopeSchema,
    categoryId: objectIdSchema.optional(),
    period: budgetPeriodSchema,
    periodAnchor: budgetDateSchema.optional(),
    allocatedMinor: amountMinorSchema,
    currency: currencySchema.default("INR"),
    rollover: z.boolean().optional().default(false),
    status: budgetStatusSchema.optional().default(BudgetStatus.Active),
    alertThresholds: alertThresholdsSchema
      .optional()
      .default(DEFAULT_ALERT_THRESHOLDS),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.scope === BudgetScope.Category && !value.categoryId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["categoryId"],
        message: "categoryId is required for category budgets",
      });
    }
    if (value.scope === BudgetScope.Overall && value.categoryId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["categoryId"],
        message: "categoryId must not be provided for overall budgets",
      });
    }
    if (value.period === BudgetPeriod.Custom && !value.periodAnchor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["periodAnchor"],
        message: "periodAnchor is required for custom budgets",
      });
    }
    if (value.period !== BudgetPeriod.Custom && value.periodAnchor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["periodAnchor"],
        message: "periodAnchor must not be provided for non-custom budgets",
      });
    }
  });

export const updateBudgetSchema = z
  .object({
    categoryId: objectIdSchema.optional(),
    period: budgetPeriodSchema.optional(),
    periodAnchor: budgetDateSchema.optional(),
    allocatedMinor: amountMinorSchema.optional(),
    currency: currencySchema.optional(),
    rollover: z.boolean().optional(),
    status: budgetStatusSchema.optional(),
    alertThresholds: alertThresholdsSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "at least one field must be provided",
  })
  .superRefine((value, ctx) => {
    if (
      value.period !== undefined &&
      value.period !== BudgetPeriod.Custom &&
      value.periodAnchor !== undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["periodAnchor"],
        message: "periodAnchor must not be provided for non-custom budgets",
      });
    }
    if (
      value.period === BudgetPeriod.Custom &&
      value.periodAnchor === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["periodAnchor"],
        message: "periodAnchor is required when changing period to custom",
      });
    }
  });

export const budgetParamsSchema = z
  .object({
    id: objectIdSchema,
  })
  .strict();

export const budgetListQuerySchema = z
  .object({
    period: budgetPeriodSchema.optional(),
    from: budgetDateSchema.optional(),
    to: budgetDateSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.from === undefined ||
      value.to === undefined ||
      value.from <= value.to,
    { message: "from must not be after to", path: ["to"] },
  );

export const budgetSummaryQuerySchema = budgetListQuerySchema;

export type CreateBudgetInput = z.input<typeof createBudgetSchema>;
export type CreateBudgetData = z.output<typeof createBudgetSchema>;
export type UpdateBudgetInput = z.input<typeof updateBudgetSchema>;
export type UpdateBudgetData = z.output<typeof updateBudgetSchema>;
export type BudgetParams = z.output<typeof budgetParamsSchema>;
export type BudgetListQuery = z.output<typeof budgetListQuerySchema>;
export type BudgetSummaryQuery = z.output<typeof budgetSummaryQuerySchema>;
