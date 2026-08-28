import { z } from "zod";
import { emailSchema, passwordSchema, deviceInfoSchema } from "./common.js";

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    name: z
      .string()
      .trim()
      .max(100, "Name must be at most 100 characters")
      .optional(),
    device: deviceInfoSchema.optional(),
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string({ required_error: "Password is required" }).min(1),
    device: deviceInfoSchema.optional(),
  })
  .strict();

export const refreshSchema = z
  .object({
    refreshToken: z
      .string({ required_error: "refreshToken is required" })
      .min(1, "refreshToken must not be empty")
      .max(512, "refreshToken is invalid"),
  })
  .strict();

export const logoutSchema = z
  .object({
    deviceId: z.string({ required_error: "deviceId is required" }).min(1),
  })
  .strict();

export type RegisterSchema = typeof registerSchema;
export type LoginSchema = typeof loginSchema;
export type RefreshSchema = typeof refreshSchema;

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
