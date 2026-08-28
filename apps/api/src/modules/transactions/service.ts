import {
  TransactionType,
  buildTransactionFingerprint,
  deriveTransactionDirection,
  isCategoryTypeCompatible,
} from "@moneytalks/shared";
import type {
  CreateTransactionData,
  TransactionListQueryData,
  TransactionListResult,
  TransactionPublic,
  UpdateTransactionData,
} from "@moneytalks/types";
import {
  AppError,
  ErrorCodes,
  notFound,
  validationError,
} from "../../lib/errors.js";
import type { AppLogger } from "../../lib/logger.js";
import {
  transactionRepository,
  type TransactionRecord,
  type TransactionRepository,
} from "./repository.js";
import {
  categoryRepository,
  type CategoryRepository,
} from "../categories/repository.js";
import {
  paymentMethodRepository,
  type PaymentMethodRepository,
} from "../payment-methods/repository.js";

export interface TransactionServiceDeps {
  logger: AppLogger;
  repository?: TransactionRepository;
  categoryRepository?: CategoryRepository;
  paymentMethodRepository?: PaymentMethodRepository;
}

export interface TransactionContext {
  userId: string;
}

function toTransactionPublic(record: TransactionRecord): TransactionPublic {
  return {
    id: record.id,
    userId: record.userId,
    clientId: record.clientId,
    type: record.type,
    direction: record.direction,
    source: record.source,
    status: record.status,
    amountMinor: record.amountMinor,
    currency: record.currency,
    transactionDate: record.transactionDate.toISOString(),
    merchant: record.merchant,
    counterparty: record.counterparty,
    note: record.note,
    tags: record.tags,
    categoryId: record.categoryId,
    paymentMethodId: record.paymentMethodId,
    accountRef: record.accountRef,
    confidence: record.confidence,
    autoDetected: record.autoDetected,
    duplicateOf: record.duplicateOf,
    duplicateGroup: record.duplicateGroup,
    editedCount: record.editedCount,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    rev: record.rev,
  };
}

export class TransactionService {
  private readonly repository: TransactionRepository;
  private readonly categoryRepo: CategoryRepository;
  private readonly paymentMethodRepo: PaymentMethodRepository;

  constructor(private readonly deps: TransactionServiceDeps) {
    this.repository = deps.repository ?? transactionRepository;
    this.categoryRepo = deps.categoryRepository ?? categoryRepository;
    this.paymentMethodRepo =
      deps.paymentMethodRepository ?? paymentMethodRepository;
  }

  /**
   * Creates a transaction, enforcing per-user ownership, clientId idempotency
   * (replaying a create with the same clientId returns the original) and
   * fingerprint-based duplicate detection (same content under a different
   * clientId surfaces as a 409).
   */
  async create(
    input: CreateTransactionData,
    ctx: TransactionContext,
  ): Promise<TransactionPublic> {
    const userId = ctx.userId;
    const direction = deriveTransactionDirection(input.type, input.direction);
    const fingerprint = buildTransactionFingerprint({
      amountMinor: input.amountMinor,
      currency: input.currency,
      transactionDate: input.transactionDate,
      merchant: input.merchant,
      source: input.source,
    });

    const existingByClientId = await this.repository.findByClientId(
      userId,
      input.clientId,
    );
    if (existingByClientId) {
      this.deps.logger.info({
        event: "transaction.idempotent_replay",
        userId,
        transactionId: existingByClientId.id,
      });
      return toTransactionPublic(existingByClientId);
    }

    const existingByFingerprint = await this.repository.findByFingerprint(
      userId,
      fingerprint,
    );
    if (existingByFingerprint) {
      throw new AppError(
        409,
        ErrorCodes.DuplicateTransaction,
        "This looks like a transaction you already have",
        { details: [{ duplicateOf: existingByFingerprint.id }] },
      );
    }

    await this.validateReferences(
      userId,
      input.type,
      input.categoryId ?? null,
      input.paymentMethodId ?? null,
    );

    try {
      const record = await this.repository.create({
        userId,
        clientId: input.clientId,
        type: input.type,
        source: input.source,
        status: input.status,
        direction,
        amountMinor: input.amountMinor,
        currency: input.currency,
        transactionDate: new Date(input.transactionDate),
        merchant: input.merchant ?? null,
        counterparty: input.counterparty ?? null,
        note: input.note ?? null,
        tags: input.tags ?? [],
        categoryId: input.categoryId ?? null,
        paymentMethodId: input.paymentMethodId ?? null,
        accountRef: input.accountRef ?? null,
        fingerprint,
      });
      return toTransactionPublic(record);
    } catch (err) {
      if (!this.isDuplicateKeyError(err)) {
        throw err;
      }
      const raced = await this.repository.findByClientId(userId, input.clientId);
      if (raced) {
        this.deps.logger.info({
          event: "transaction.idempotent_replay_race",
          userId,
          transactionId: raced.id,
        });
        return toTransactionPublic(raced);
      }
      throw new AppError(
        409,
        ErrorCodes.DuplicateTransaction,
        "This looks like a transaction you already have",
      );
    }
  }

  async findById(
    userId: string,
    id: string,
  ): Promise<TransactionPublic | null> {
    const record = await this.repository.findById(userId, id);
    return record ? toTransactionPublic(record) : null;
  }

  async list(
    userId: string,
    query: TransactionListQueryData,
  ): Promise<TransactionListResult> {
    const result = await this.repository.list(userId, query, {
      limit: query.limit,
      cursor: query.cursor,
    });
    return {
      items: result.items.map(toTransactionPublic),
      nextCursor: result.nextCursor,
      total: result.total,
    };
  }

  /**
   * Patches a transaction owned by the user. Identity fields (userId, clientId)
   * can never change, direction is only settable for transfer/adjustment and
   * the fingerprint is recomputed whenever any of its inputs change, which can
   * surface as a 409 duplicate when it collides with another transaction.
   */
  async update(
    userId: string,
    id: string,
    input: UpdateTransactionData,
  ): Promise<TransactionPublic> {
    const existing = await this.repository.findById(userId, id);
    if (!existing) {
      throw notFound("Transaction not found");
    }

    const type = input.type ?? existing.type;
    const amountMinor = input.amountMinor ?? existing.amountMinor;
    const currency = input.currency ?? existing.currency;
    const transactionDate = input.transactionDate
      ? new Date(input.transactionDate)
      : existing.transactionDate;
    const merchant =
      input.merchant !== undefined ? input.merchant : existing.merchant;
    const counterparty =
      input.counterparty !== undefined
        ? input.counterparty
        : existing.counterparty;
    const note = input.note !== undefined ? input.note : existing.note;
    const tags = input.tags ?? existing.tags;
    const categoryId =
      input.categoryId !== undefined ? input.categoryId : existing.categoryId;
    const paymentMethodId =
      input.paymentMethodId !== undefined
        ? input.paymentMethodId
        : existing.paymentMethodId;
    const accountRef =
      input.accountRef !== undefined ? input.accountRef : existing.accountRef;
    const status = input.status ?? existing.status;

    await this.validateReferences(userId, type, categoryId, paymentMethodId);

    let direction = existing.direction;
    if (input.direction !== undefined) {
      const directionAllowed =
        type === TransactionType.Transfer || type === TransactionType.Adjustment;
      if (!directionAllowed) {
        throw validationError("Request is invalid", [
          {
            field: "direction",
            message:
              "direction is derived from type and must not be provided for this type",
          },
        ]);
      }
      direction = input.direction;
    } else if (input.type !== undefined) {
      direction = deriveTransactionDirection(input.type);
    }

    const fingerprintChanged =
      (input.amountMinor !== undefined &&
        input.amountMinor !== existing.amountMinor) ||
      (input.currency !== undefined && input.currency !== existing.currency) ||
      (input.transactionDate !== undefined &&
        transactionDate.getTime() !== existing.transactionDate.getTime()) ||
      (input.merchant !== undefined && input.merchant !== existing.merchant);
    const fingerprint = fingerprintChanged
      ? buildTransactionFingerprint({
          amountMinor,
          currency,
          transactionDate,
          merchant: merchant ?? undefined,
          source: existing.source,
        })
      : (existing.fingerprint ?? undefined);

    if (fingerprint && fingerprintChanged) {
      const dupe = await this.repository.findByFingerprint(userId, fingerprint);
      if (dupe && dupe.id !== existing.id) {
        throw new AppError(
          409,
          ErrorCodes.DuplicateTransaction,
          "This looks like a transaction you already have",
          { details: [{ duplicateOf: dupe.id }] },
        );
      }
    }

    try {
      const record = await this.repository.update(
        userId,
        id,
        {
          type,
          status,
          direction,
          amountMinor,
          currency,
          transactionDate,
          merchant,
          counterparty,
          note,
          tags,
          categoryId,
          paymentMethodId,
          accountRef,
          fingerprint,
        },
        userId,
      );
      if (!record) {
        throw notFound("Transaction not found");
      }
      return toTransactionPublic(record);
    } catch (err) {
      if (!this.isDuplicateKeyError(err)) {
        throw err;
      }
      if (fingerprint) {
        const racer = await this.repository.findByFingerprint(
          userId,
          fingerprint,
        );
        if (racer && racer.id !== existing.id) {
          throw new AppError(
            409,
            ErrorCodes.DuplicateTransaction,
            "This looks like a transaction you already have",
            { details: [{ duplicateOf: racer.id }] },
          );
        }
      }
      throw new AppError(
        409,
        ErrorCodes.DuplicateTransaction,
        "This looks like a transaction you already have",
      );
    }
  }

  async softDelete(userId: string, id: string): Promise<void> {
    const record = await this.repository.softDelete(userId, id, userId);
    if (!record) {
      throw notFound("Transaction not found");
    }
  }

  /**
   * Enforces referential integrity for a transaction's category and payment
   * method. Both must belong to the user and must not be soft-deleted; the
   * category must also be type-compatible with the (final) transaction type.
   * A `null` reference clears the field and is never validated.
   */
  private async validateReferences(
    userId: string,
    type: string,
    categoryId: string | null,
    paymentMethodId: string | null,
  ): Promise<void> {
    if (categoryId !== null) {
      const category = await this.categoryRepo.findActiveById(
        userId,
        categoryId,
      );
      if (!category) {
        throw notFound("Category not found");
      }
      if (
        !isCategoryTypeCompatible(
          type as TransactionType,
          category.type as "income" | "expense" | "transfer",
        )
      ) {
        throw validationError("Request is invalid", [
          {
            field: "categoryId",
            message:
              "category type is not compatible with the transaction type",
          },
        ]);
      }
    }

    if (paymentMethodId !== null) {
      const method = await this.paymentMethodRepo.findActiveById(
        userId,
        paymentMethodId,
      );
      if (!method) {
        throw notFound("Payment method not found");
      }
    }
  }

  private isDuplicateKeyError(err: unknown): boolean {
    return (
      typeof err === "object" &&
      err !== null &&
      (err as { code?: number }).code === 11000
    );
  }
}
