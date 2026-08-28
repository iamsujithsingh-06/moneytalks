import { EntityStatus } from "@moneytalks/shared";
import type {
  CreatePaymentMethodData,
  PaymentMethodListQuery,
  PaymentMethodPublic,
  UpdatePaymentMethodData,
} from "@moneytalks/types";
import {
  AppError,
  ErrorCodes,
  notFound,
} from "../../lib/errors.js";
import type { AppLogger } from "../../lib/logger.js";
import {
  paymentMethodRepository,
  type PaymentMethodRecord,
  type PaymentMethodRepository,
} from "./repository.js";

export interface PaymentMethodServiceDeps {
  logger: AppLogger;
  repository?: PaymentMethodRepository;
}

export interface PaymentMethodContext {
  userId: string;
}

function toPaymentMethodPublic(
  record: PaymentMethodRecord,
): PaymentMethodPublic {
  return {
    id: record.id,
    userId: record.userId,
    clientId: record.clientId,
    name: record.name,
    kind: record.kind,
    provider: record.provider,
    maskedNumber: record.maskedNumber,
    accountRef: record.accountRef,
    isDefault: record.isDefault,
    status: record.status,
    deleted: record.deletedAt !== null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    rev: record.rev,
  };
}

export class PaymentMethodService {
  private readonly repository: PaymentMethodRepository;

  constructor(private readonly deps: PaymentMethodServiceDeps) {
    this.repository = deps.repository ?? paymentMethodRepository;
  }

  async create(
    input: CreatePaymentMethodData,
    ctx: PaymentMethodContext,
  ): Promise<PaymentMethodPublic> {
    const userId = ctx.userId;

    const existing = await this.repository.findByNameAndKind(
      userId,
      input.name,
      input.kind,
    );
    if (existing) {
      throw this.paymentMethodExists(input.name);
    }

    const isDefault = input.isDefault ?? false;
    if (isDefault) {
      await this.repository.resetDefault(userId);
    }

    try {
      const record = await this.repository.create({
        userId,
        clientId: input.clientId,
        name: input.name,
        kind: input.kind,
        provider: input.provider ?? null,
        maskedNumber: input.maskedNumber ?? null,
        accountRef: input.accountRef ?? null,
        isDefault,
        status: EntityStatus.Active,
      });
      return toPaymentMethodPublic(record);
    } catch (err) {
      if (!this.isDuplicateKeyError(err)) {
        throw err;
      }
      const raced = await this.repository.findByNameAndKind(
        userId,
        input.name,
        input.kind,
      );
      if (raced) {
        throw this.paymentMethodExists(input.name);
      }
      throw new AppError(
        500,
        ErrorCodes.Internal,
        "Could not create the payment method",
        { cause: err },
      );
    }
  }

  async list(
    userId: string,
    query: PaymentMethodListQuery,
  ): Promise<PaymentMethodPublic[]> {
    const records = await this.repository.listByUser(userId, {
      kind: query.kind,
    });
    return records.map(toPaymentMethodPublic);
  }

  async findById(
    userId: string,
    id: string,
  ): Promise<PaymentMethodPublic | null> {
    const record = await this.repository.findActiveById(userId, id);
    return record ? toPaymentMethodPublic(record) : null;
  }

  async update(
    userId: string,
    id: string,
    input: UpdatePaymentMethodData,
  ): Promise<PaymentMethodPublic> {
    const existing = await this.repository.findActiveById(userId, id);
    if (!existing) {
      throw notFound("Payment method not found");
    }

    if (input.name !== undefined && input.name !== existing.name) {
      const conflict = await this.repository.findByNameAndKind(
        userId,
        input.name,
        existing.kind,
      );
      if (conflict) {
        throw this.paymentMethodExists(input.name);
      }
    }

    if (input.isDefault === true) {
      await this.repository.resetDefault(userId);
    }

    const record = await this.repository.update(userId, id, {
      name: input.name,
      provider: input.provider,
      maskedNumber: input.maskedNumber,
      accountRef: input.accountRef,
      isDefault: input.isDefault,
      status: input.status,
    });
    if (!record) {
      throw notFound("Payment method not found");
    }
    return toPaymentMethodPublic(record);
  }

  async softDelete(
    userId: string,
    paymentMethodId: string,
    deletedBy: string,
  ): Promise<void> {
    const existing = await this.repository.findById(userId, paymentMethodId);
    if (!existing) {
      throw notFound("Payment method not found");
    }
    if (existing.deletedAt) {
      return;
    }
    await this.repository.softDelete(userId, paymentMethodId, deletedBy);
  }

  private paymentMethodExists(name: string): AppError {
    return new AppError(
      409,
      ErrorCodes.PaymentMethodExists,
      `A payment method named "${name}" already exists for this kind`,
    );
  }

  private isDuplicateKeyError(err: unknown): boolean {
    return (
      typeof err === "object" &&
      err !== null &&
      (err as { code?: number }).code === 11000
    );
  }
}
