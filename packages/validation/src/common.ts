import { z } from "zod";
import { DevicePlatform } from "@moneytalks/shared";

export const emailSchema = z
  .string({ required_error: "Email is required" })
  .trim()
  .toLowerCase()
  .min(3, "Email must be at least 3 characters")
  .max(254, "Email must be at most 254 characters")
  .email("Must be a valid email address");

export const passwordSchema = z
  .string({ required_error: "Password is required" })
  .min(12, "Password must be at least 12 characters")
  .max(128, "Password must be at most 128 characters")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[0-9]/, "Password must contain at least one digit");

export const deviceNameSchema = z
  .string()
  .trim()
  .max(100, "Device name must be at most 100 characters")
  .optional();

export const deviceFingerprintSchema = z
  .string()
  .trim()
  .max(512, "Device fingerprint must be at most 512 characters")
  .optional();

export const devicePlatformSchema = z
  .enum([DevicePlatform.Web, DevicePlatform.Android], {
    errorMap: () => ({ message: "Platform must be 'web' or 'android'" }),
  })
  .optional()
  .default(DevicePlatform.Web);

export const deviceInfoSchema = z
  .object({
    name: deviceNameSchema,
    platform: devicePlatformSchema,
    fingerprint: deviceFingerprintSchema,
  })
  .strict();

export type DeviceInfoInput = z.infer<typeof deviceInfoSchema>;
