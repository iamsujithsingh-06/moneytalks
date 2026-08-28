import { z } from "zod";
import { AnalyticsGranularity } from "@moneytalks/shared";
import { budgetDateSchema } from "./budgets.js";
import { categoryTypeSchema } from "./categories.js";

export const analyticsGranularitySchema = z.enum(
  [
    AnalyticsGranularity.Daily,
    AnalyticsGranularity.Weekly,
    AnalyticsGranularity.Monthly,
  ],
  {
    errorMap: () => ({
      message: "granularity must be one of daily, weekly, monthly",
    }),
  },
);

const rangeRefine = (value: {
  from?: string;
  to?: string;
}): boolean =>
  value.from === undefined ||
  value.to === undefined ||
  value.from <= value.to;

export const analyticsSummaryQuerySchema = z
  .object({
    from: budgetDateSchema.optional(),
    to: budgetDateSchema.optional(),
    granularity: analyticsGranularitySchema
      .optional()
      .default(AnalyticsGranularity.Monthly),
  })
  .strict()
  .refine(rangeRefine, { message: "from must not be after to", path: ["to"] });

export const analyticsCashflowQuerySchema = z
  .object({
    from: budgetDateSchema.optional(),
    to: budgetDateSchema.optional(),
    granularity: analyticsGranularitySchema
      .optional()
      .default(AnalyticsGranularity.Monthly),
  })
  .strict()
  .refine(rangeRefine, { message: "from must not be after to", path: ["to"] });

export const analyticsCategoriesQuerySchema = z
  .object({
    from: budgetDateSchema.optional(),
    to: budgetDateSchema.optional(),
    type: categoryTypeSchema.optional().default("expense"),
  })
  .strict()
  .refine(rangeRefine, { message: "from must not be after to", path: ["to"] });

export type AnalyticsSummaryQuery = z.output<
  typeof analyticsSummaryQuerySchema
>;
export type AnalyticsCashflowQuery = z.output<
  typeof analyticsCashflowQuerySchema
>;
export type AnalyticsCategoriesQuery = z.output<
  typeof analyticsCategoriesQuerySchema
>;
