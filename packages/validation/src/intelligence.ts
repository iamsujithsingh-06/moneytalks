import { z } from "zod";

/** Query for the read-only intelligence report (no mutations). */
export const intelligenceQuerySchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .strict();

export type IntelligenceQuery = z.output<typeof intelligenceQuerySchema>;

/** Assistant question body. Read-only in effect. */
export const assistantQuerySchema = z
  .object({
    question: z
      .string({ required_error: "question is required" })
      .trim()
      .min(1, "question must not be empty")
      .max(500, "question is too long"),
  })
  .strict();

export type AssistantQueryInput = z.input<typeof assistantQuerySchema>;
export type AssistantQueryData = z.output<typeof assistantQuerySchema>;
