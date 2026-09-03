import { z } from "zod";
import { clientIdSchema } from "./transactions.js";

/**
 * Initial balance is a non-negative integer in minor units. `0` is valid and
 * means "not set" / no starting balance.
 */
export const initialBalanceMinorSchema = z
  .number({
    required_error: "initialBalanceMinor is required",
    invalid_type_error: "initialBalanceMinor must be a number",
  })
  .int("initialBalanceMinor must be an integer")
  .min(0, "initialBalanceMinor must be at least 0")
  .max(1_000_000_000_000, "initialBalanceMinor is too large");

export const createSettingsSchema = z
  .object({
    clientId: clientIdSchema,
    initialBalanceMinor: initialBalanceMinorSchema,
  })
  .strict();

export const updateSettingsSchema = z
  .object({
    initialBalanceMinor: initialBalanceMinorSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "at least one field must be provided",
  });

export type CreateSettingsInput = z.input<typeof createSettingsSchema>;
export type CreateSettingsData = z.output<typeof createSettingsSchema>;
export type UpdateSettingsInput = z.input<typeof updateSettingsSchema>;
export type UpdateSettingsData = z.output<typeof updateSettingsSchema>;
