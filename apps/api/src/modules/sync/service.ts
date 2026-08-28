import type {
  CategoryPublic,
  PaymentMethodPublic,
  SyncChange,
  SyncChangesResult,
  SyncEntity,
  SyncOp,
  SyncPushOp,
  SyncPushResult,
  SyncPushResultItem,
  SyncStateResult,
  TransactionPublic,
} from "@moneytalks/types";
import {
  createCategorySchema,
  createPaymentMethodSchema,
  createTransactionSchema,
  updateCategorySchema,
  updatePaymentMethodSchema,
  updateTransactionSchema,
} from "@moneytalks/validation";
import type { AppLogger } from "../../lib/logger.js";
import { validationError } from "../../lib/errors.js";
import type { TransactionService } from "../transactions/service.js";
import type { CategoryService } from "../categories/service.js";
import type { PaymentMethodService } from "../payment-methods/service.js";
import {
  createSyncRepository,
  encodeCursor,
  parseCursor,
  type SyncRepository,
} from "./repository.js";
import {
  categoryRepository,
  type CategoryRepository,
} from "../categories/repository.js";
import {
  paymentMethodRepository,
  type PaymentMethodRepository,
} from "../payment-methods/repository.js";
import {
  transactionRepository,
  type TransactionRepository,
} from "../transactions/repository.js";

export const SYNC_ENTITY_LIST: SyncEntity[] = [
  "transactions",
  "categories",
  "payment-methods",
];

export interface SyncServiceDeps {
  logger: AppLogger;
  transactionService: TransactionService;
  categoryService: CategoryService;
  paymentMethodService: PaymentMethodService;
  repository?: SyncRepository;
  transactionRepository?: TransactionRepository;
  categoryRepository?: CategoryRepository;
  paymentMethodRepository?: PaymentMethodRepository;
}

export interface SyncContext {
  userId: string;
  deviceId: string;
}

export interface SyncChangesQueryData {
  cursor?: string;
  entities?: SyncEntity[];
  limit: number;
}

function oid(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

function serializeTransaction(
  doc: Record<string, unknown>,
  idField = "_id",
): TransactionPublic {
  return {
    id: String(doc[idField]),
    userId: oid(doc.userId) ?? "",
    clientId: String(doc.clientId ?? ""),
    type: String(doc.type ?? ""),
    direction: String(doc.direction ?? ""),
    source: String(doc.source ?? ""),
    status: String(doc.status ?? ""),
    amountMinor: (doc.amountMinor as number) ?? 0,
    currency: String(doc.currency ?? ""),
    transactionDate: toIso(doc.transactionDate),
    merchant: (doc.merchant as string | null) ?? null,
    counterparty: (doc.counterparty as string | null) ?? null,
    note: (doc.note as string | null) ?? null,
    tags: (doc.tags as string[]) ?? [],
    categoryId: oid(doc.categoryId),
    paymentMethodId: oid(doc.paymentMethodId),
    accountRef: (doc.accountRef as string | null) ?? null,
    confidence: (doc.confidence as number | null) ?? null,
    autoDetected: Boolean(doc.autoDetected),
    duplicateOf: oid(doc.duplicateOf),
    duplicateGroup: (doc.duplicateGroup as string | null) ?? null,
    editedCount: (doc.editedCount as number) ?? 0,
    createdAt: toIso(doc.createdAt),
    updatedAt: toIso(doc.updatedAt),
    rev: (doc.rev as number) ?? 0,
  };
}

function serializeCategory(
  doc: Record<string, unknown>,
  idField = "_id",
): CategoryPublic {
  return {
    id: String(doc[idField]),
    userId: oid(doc.userId) ?? "",
    clientId: String(doc.clientId ?? ""),
    name: String(doc.name ?? ""),
    type: String(doc.type ?? ""),
    icon: (doc.icon as string | null) ?? null,
    color: (doc.color as string | null) ?? null,
    parentId: oid(doc.parentId),
    sortOrder: (doc.sortOrder as number) ?? 0,
    isPreset: Boolean(doc.isPreset),
    isDefault: Boolean(doc.isDefault),
    status: String(doc.status ?? "active"),
    deleted: doc.deletedAt ? true : false,
    createdAt: toIso(doc.createdAt),
    updatedAt: toIso(doc.updatedAt),
    rev: (doc.rev as number) ?? 0,
  };
}

function serializePaymentMethod(
  doc: Record<string, unknown>,
  idField = "_id",
): PaymentMethodPublic {
  return {
    id: String(doc[idField]),
    userId: oid(doc.userId) ?? "",
    clientId: String(doc.clientId ?? ""),
    name: String(doc.name ?? ""),
    kind: String(doc.kind ?? ""),
    provider: (doc.provider as string | null) ?? null,
    maskedNumber: (doc.maskedNumber as string | null) ?? null,
    accountRef: (doc.accountRef as string | null) ?? null,
    isDefault: Boolean(doc.isDefault),
    status: String(doc.status ?? "active"),
    deleted: doc.deletedAt ? true : false,
    createdAt: toIso(doc.createdAt),
    updatedAt: toIso(doc.updatedAt),
    rev: (doc.rev as number) ?? 0,
  };
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString();
  }
  return "";
}

interface TargetRecord {
  id: string;
  clientId: string;
  rev: number;
  deletedAt: Date | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

type SchemaLike = {
  safeParse: (value: unknown) => {
    success: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: any;
    error?: { issues?: unknown[] };
  };
};

export class SyncService {
  private readonly repository: SyncRepository;
  private readonly transactionRepo: TransactionRepository;
  private readonly categoryRepo: CategoryRepository;
  private readonly paymentMethodRepo: PaymentMethodRepository;

  constructor(private readonly deps: SyncServiceDeps) {
    this.repository = deps.repository ?? createSyncRepository();
    this.transactionRepo = deps.transactionRepository ?? transactionRepository;
    this.categoryRepo = deps.categoryRepository ?? categoryRepository;
    this.paymentMethodRepo =
      deps.paymentMethodRepository ?? paymentMethodRepository;
  }

  async changes(
    ctx: SyncContext,
    query: SyncChangesQueryData,
  ): Promise<SyncChangesResult> {
    const entities = query.entities?.length ? query.entities : SYNC_ENTITY_LIST;
    const cursor = query.cursor ? parseCursor(query.cursor) : null;
    if (query.cursor && !cursor) {
      throw validationError("Cursor is invalid", [
        { field: "cursor", message: "cursor could not be decoded" },
      ]);
    }

    const itemsByEntity: SyncChangesResult["itemsByEntity"] = {};
    let globalMax: { date: Date; id: string; cursor: string } | null = null;
    let hasMore = false;

    for (const entity of entities) {
      const page = await this.repository.pull(
        ctx.userId,
        entity,
        cursor,
        query.limit,
      );
      const changes = page.items.map((item) =>
        this.buildChange(entity, item),
      );
      if (changes.length > 0) {
        itemsByEntity[entity] = changes;
      }
      if (page.hasMore) hasMore = true;

      // Advance the per-entity cursor to the max (updatedAt, _id) returned.
      for (const item of page.items) {
        const key = item.updatedAt.getTime();
        if (
          !globalMax ||
          key > globalMax.date.getTime() ||
          (key === globalMax.date.getTime() && item.id > globalMax.id)
        ) {
          globalMax = {
            date: item.updatedAt,
            id: item.id,
            cursor: encodeCursor(item.updatedAt, item.id),
          };
        }
      }
    }

    const nextCursor = globalMax?.cursor ?? query.cursor ?? null;

    // Persist the advance cursor + ping sync records for the device.
    for (const entity of entities) {
      if (nextCursor) {
        await this.repository.saveCursor(ctx.userId, ctx.deviceId, entity, nextCursor, {
          state: "idle",
        });
      } else {
        await this.repository.saveCursor(ctx.userId, ctx.deviceId, entity, null, {
          state: "idle",
        });
      }
    }

    return { itemsByEntity, nextCursor, hasMore };
  }

  async push(ctx: SyncContext, ops: SyncPushOp[]): Promise<SyncPushResult> {
    const results: SyncPushResultItem[] = [];
    for (const op of ops) {
      results.push(await this.applyOp(ctx, op));
    }
    return { results };
  }

  async state(ctx: SyncContext): Promise<SyncStateResult> {
    const records =
      (await this.repository.listSyncState(
        ctx.userId,
        ctx.deviceId,
        SYNC_ENTITY_LIST,
      )) ?? [];
    const map = new Map(records.map((r) => [r.entity, r]));
    const merged: SyncStateResult["records"] = SYNC_ENTITY_LIST.map((entity) => {
      const existing = map.get(entity);
      if (!existing) {
        return {
          entity,
          lastCursor: null,
          lastSyncAt: null,
          opsProcessed: 0,
          state: "idle" as const,
        };
      }
      return {
        entity,
        lastCursor: existing.lastCursor,
        lastSyncAt: existing.lastSyncAt ? existing.lastSyncAt.toISOString() : null,
        opsProcessed: existing.opsProcessed,
        state: existing.state,
      };
    });
    return { records: merged };
  }

  async bootstrap(ctx: SyncContext): Promise<SyncChangesResult> {
    // Baseline snapshot: pull from the beginning (ignore stored cursor).
    return this.changes(
      ctx,
      { cursor: undefined, entities: SYNC_ENTITY_LIST, limit: 500 },
    );
  }

  private buildChange(
    entity: SyncEntity,
    item: { id: string; clientId: string; rev: number; updatedAt: Date; deletedAt: Date | null; doc: Record<string, unknown> },
  ): SyncChange {
    const isDelete = item.deletedAt !== null;
    const base: SyncChange = {
      id: item.id,
      clientId: item.clientId || undefined,
      entity,
      rev: item.rev,
      updatedAt: item.updatedAt.toISOString(),
      deletedAt: isDelete ? item.deletedAt!.toISOString() : null,
      deleted: isDelete,
      changeType: isDelete ? "delete" : "upsert",
      payload: isDelete ? null : this.serialize(entity, item.doc),
    };
    return base;
  }

  private serialize(entity: SyncEntity, doc: Record<string, unknown>) {
    switch (entity) {
      case "transactions":
        return serializeTransaction(doc, "_id") as unknown as Record<string, unknown>;
      case "categories":
        return serializeCategory(doc, "_id") as unknown as Record<string, unknown>;
      case "payment-methods":
        return serializePaymentMethod(doc, "_id") as unknown as Record<string, unknown>;
    }
  }

  private async applyOp(
    ctx: SyncContext,
    op: SyncPushOp,
  ): Promise<SyncPushResultItem> {
    const common = {
      op: op.op,
      entity: op.entity,
      clientId: op.clientId,
    };

    switch (op.op) {
      case "create":
        return this.applyCreate(ctx, op, common);
      case "update":
        return this.applyUpdate(ctx, op, common);
      case "delete":
        return this.applyDelete(ctx, op, common);
    }
  }

  private async applyCreate(
    ctx: SyncContext,
    op: SyncPushOp,
    common: { op: SyncOp; entity: SyncEntity; clientId: string },
  ): Promise<SyncPushResultItem> {
    const existing = await this.findTarget(ctx.userId, op.entity, op.clientId);
    if (existing) {
      // Idempotent replay of a create → return the canonical (possibly tombstone).
      return {
        ...common,
        status: "duplicate",
        id: existing.id,
        canonical: existing.deletedAt
          ? this.tombstone(existing, op.entity, existing.deletedAt)
          : this.serialize(op.entity, existing.doc),
      };
    }

    const parsed = this.validateCreate(op.entity, {
      ...op.payload,
      clientId: op.clientId,
    });
    if (!parsed.valid) {
      return { ...common, status: "rejected", reason: parsed.reason };
    }

    try {
      const created = await this.createViaService(
        ctx.userId,
        op.entity,
        parsed.data,
        op.clientId,
      );
      return {
        ...common,
        status: "applied",
        id: created.id,
        canonical: created.canonical ?? null,
      };
    } catch (err) {
      return {
        ...common,
        status: "rejected",
        reason: this.errorReason(err),
      };
    }
  }

  private async applyUpdate(
    ctx: SyncContext,
    op: SyncPushOp,
    common: { op: SyncOp; entity: SyncEntity; clientId: string },
  ): Promise<SyncPushResultItem> {
    const existing = await this.findTarget(ctx.userId, op.entity, op.clientId);
    if (!existing) {
      return { ...common, status: "rejected", reason: "not_found" };
    }
    if (existing.deletedAt) {
      // Newer delete wins; the update becomes a no-op.
      return {
        ...common,
        status: "rejected",
        id: existing.id,
        reason: "deleted",
        canonical: this.tombstone(existing, op.entity, existing.deletedAt),
      };
    }

    const conflict =
      op.baseRev !== undefined && op.baseRev !== null && op.baseRev < existing.rev;

    const parsed = this.validateUpdate(op.entity, op.payload);
    if (!parsed.valid) {
      return { ...common, status: "rejected", id: existing.id, reason: parsed.reason };
    }

    try {
      const updated = await this.updateViaService(
        ctx.userId,
        op.entity,
        existing.id,
        parsed.data,
      );
      return {
        ...common,
        status: conflict ? "conflict" : "applied",
        id: updated.id,
        canonical: updated.canonical ?? null,
        conflict: conflict || undefined,
      };
    } catch (err) {
      return { ...common, status: "rejected", id: existing.id, reason: this.errorReason(err) };
    }
  }

  private async applyDelete(
    ctx: SyncContext,
    op: SyncPushOp,
    common: { op: SyncOp; entity: SyncEntity; clientId: string },
  ): Promise<SyncPushResultItem> {
    const existing = await this.findTarget(ctx.userId, op.entity, op.clientId);
    if (!existing || existing.deletedAt) {
      return {
        ...common,
        status: "duplicate",
        id: existing?.id,
        canonical: existing
          ? this.tombstone(existing, op.entity, existing.deletedAt ?? new Date())
          : null,
      };
    }

    try {
      await this.deleteViaService(ctx.userId, op.entity, existing.id);
      const after = await this.findTarget(ctx.userId, op.entity, op.clientId);
      return {
        ...common,
        status: "applied",
        id: existing.id,
        canonical: this.tombstone(
          after ?? existing,
          op.entity,
          after?.deletedAt ?? new Date(),
        ),
      };
    } catch (err) {
      return { ...common, status: "rejected", id: existing.id, reason: this.errorReason(err) };
    }
  }

  private tombstone(
    target: { id: string; rev: number },
    entity: SyncEntity,
    deletedAt: Date,
  ): Record<string, unknown> {
    void entity;
    return {
      id: target.id,
      deleted: true,
      deletedAt: toIso(deletedAt),
      rev: target.rev,
    };
  }

  private validateCreate(entity: SyncEntity, payload: unknown) {
    return this.parse(entity, payload, "create");
  }

  private validateUpdate(entity: SyncEntity, payload: unknown) {
    return this.parse(entity, payload, "update");
  }

  private parse(
    entity: SyncEntity,
    payload: unknown,
    op: "create" | "update",
  ): { valid: true; data: Record<string, unknown> } | { valid: false; reason: string } {
    let schema: SchemaLike;
    switch (entity) {
      case "transactions":
        schema = op === "create" ? createTransactionSchema : updateTransactionSchema;
        break;
      case "categories":
        schema = op === "create" ? createCategorySchema : updateCategorySchema;
        break;
      case "payment-methods":
        schema = op === "create" ? createPaymentMethodSchema : updatePaymentMethodSchema;
        break;
    }
    const result = schema.safeParse(payload);
    if (!result.success) {
      return { valid: false, reason: "validation_failed" };
    }
    return { valid: true, data: result.data as Record<string, unknown> };
  }

  private async createViaService(
    userId: string,
    entity: SyncEntity,
    payload: Record<string, unknown>,
    clientId: string,
  ): Promise<{ id: string; canonical: Record<string, unknown> }> {
    const p = { ...payload, clientId };
    if (entity === "transactions") {
      const doc = await this.deps.transactionService.create(
        p as never,
        { userId },
      );
      return { id: doc.id, canonical: doc as unknown as Record<string, unknown> };
    }
    if (entity === "categories") {
      const doc = await this.deps.categoryService.create(p as never, { userId });
      return { id: doc.id, canonical: doc as unknown as Record<string, unknown> };
    }
    const doc = await this.deps.paymentMethodService.create(p as never, { userId });
    return { id: doc.id, canonical: doc as unknown as Record<string, unknown> };
  }

  private async updateViaService(
    userId: string,
    entity: SyncEntity,
    id: string,
    payload: Record<string, unknown>,
  ): Promise<{ id: string; canonical: Record<string, unknown> }> {
    if (entity === "transactions") {
      const doc = await this.deps.transactionService.update(userId, id, payload as never);
      return { id: doc.id, canonical: doc as unknown as Record<string, unknown> };
    }
    if (entity === "categories") {
      const doc = await this.deps.categoryService.update(userId, id, payload as never);
      return { id: doc.id, canonical: doc as unknown as Record<string, unknown> };
    }
    const doc = await this.deps.paymentMethodService.update(userId, id, payload as never);
    return { id: doc.id, canonical: doc as unknown as Record<string, unknown> };
  }

  private async deleteViaService(
    userId: string,
    entity: SyncEntity,
    id: string,
  ): Promise<void> {
    if (entity === "transactions") {
      await this.deps.transactionService.softDelete(userId, id);
      return;
    }
    if (entity === "categories") {
      await this.deps.categoryService.softDelete(userId, id, userId);
      return;
    }
    await this.deps.paymentMethodService.softDelete(userId, id, userId);
  }

  private async findTarget(
    userId: string,
    entity: SyncEntity,
    clientId: string,
  ): Promise<TargetRecord | null> {
    let rec: unknown = null;
    if (entity === "transactions") {
      rec = await this.transactionRepo.findByClientId(userId, clientId);
    } else if (entity === "categories") {
      rec = await this.categoryRepo.findByClientId(userId, clientId);
    } else {
      rec = await this.paymentMethodRepo.findByClientId(userId, clientId);
    }
    if (!rec) return null;
    const r = rec as {
      id: string;
      clientId: string;
      rev: number;
      deletedAt?: Date | null;
    };
    return {
      id: r.id,
      clientId: r.clientId,
      rev: r.rev,
      deletedAt: r.deletedAt ?? null,
      doc: r as unknown as Record<string, unknown>,
    };
  }

  private errorReason(err: unknown): string {
    const code = (err as { code?: string })?.code;
    if (typeof code === "string" && code.length > 0) return code.toLowerCase();
    return "error";
  }
}
