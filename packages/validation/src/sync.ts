import { z } from "zod";
import { clientIdSchema, objectIdSchema } from "./transactions.js";

const SYNC_ENTITIES = ["transactions", "categories", "payment-methods"] as const;
const SYNC_OPS = ["create", "update", "delete"] as const;

export const syncEntitySchema = z.enum(SYNC_ENTITIES, {
  errorMap: () => ({ message: "entity is invalid" }),
});

export const syncOpSchema = z.enum(SYNC_OPS, {
  errorMap: () => ({ message: "op must be one of create, update, delete" }),
});

export const syncChangesQuerySchema = z
  .object({
    cursor: z.string().trim().min(1, "cursor must not be empty").optional(),
    entities: z
      .preprocess(
        (value) => {
          if (value === undefined) return undefined;
          if (Array.isArray(value)) return value;
          return String(value)
            .split(",")
            .map((part) => part.trim())
            .filter((part) => part.length > 0);
        },
        z.array(syncEntitySchema).max(10),
      )
      .optional(),
    limit: z.coerce.number().int().min(1).max(500).default(200),
  })
  .strict();

export const syncPushOpSchema = z
  .object({
    entity: syncEntitySchema,
    op: syncOpSchema,
    clientId: clientIdSchema,
    id: objectIdSchema.optional(),
    baseRev: z.number().int().min(0).optional().nullable(),
    idempotencyKey: z.string().trim().min(1).max(128).optional(),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

export const syncPushBodySchema = z
  .object({
    deviceId: z.string().trim().min(1).max(128),
    ops: z.array(syncPushOpSchema).min(1).max(100),
  })
  .strict();

export type SyncChangesQueryInput = z.input<typeof syncChangesQuerySchema>;
export type SyncChangesQueryData = z.output<typeof syncChangesQuerySchema>;
export type SyncPushBodyInput = z.input<typeof syncPushBodySchema>;
export type SyncPushBodyData = z.output<typeof syncPushBodySchema>;
