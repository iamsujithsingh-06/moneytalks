import { randomUUID } from "node:crypto";
import { DEFAULT_CATEGORY_CATALOG, EntityStatus } from "@moneytalks/shared";
import type {
  CategoryListQuery,
  CategoryPublic,
  CreateCategoryData,
  UpdateCategoryData,
} from "@moneytalks/types";
import {
  AppError,
  ErrorCodes,
  notFound,
  validationError,
} from "../../lib/errors.js";
import type { AppLogger } from "../../lib/logger.js";
import {
  categoryRepository,
  type CategoryRecord,
  type CategoryRepository,
} from "./repository.js";
import {
  transactionRepository,
  type TransactionRepository,
} from "../transactions/repository.js";

export interface CategoryServiceDeps {
  logger: AppLogger;
  categoryRepository?: CategoryRepository;
  transactionRepository?: TransactionRepository;
}

export interface CategoryContext {
  userId: string;
}

function toCategoryPublic(record: CategoryRecord): CategoryPublic {
  return {
    id: record.id,
    userId: record.userId,
    clientId: record.clientId,
    name: record.name,
    type: record.type,
    icon: record.icon,
    color: record.color,
    parentId: record.parentId,
    sortOrder: record.sortOrder,
    isPreset: record.isPreset,
    isDefault: record.isDefault,
    status: record.status,
    deleted: record.deletedAt !== null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    rev: record.rev,
  };
}

export class CategoryService {
  private readonly repository: CategoryRepository;
  private readonly transactionRepo: TransactionRepository;

  constructor(private readonly deps: CategoryServiceDeps) {
    this.repository = deps.categoryRepository ?? categoryRepository;
    this.transactionRepo =
      deps.transactionRepository ?? transactionRepository;
  }

  async create(
    input: CreateCategoryData,
    ctx: CategoryContext,
  ): Promise<CategoryPublic> {
    const userId = ctx.userId;

    const existing = await this.repository.findByNameAndType(
      userId,
      input.name,
      input.type,
    );
    if (existing) {
      throw this.categoryExists(input.name);
    }

    const sortOrder =
      input.sortOrder ??
      (await this.repository.maxSortOrder(userId, input.type)) + 1;

    const isDefault = input.isDefault ?? false;
    if (isDefault) {
      await this.repository.resetDefaults(userId, input.type);
    }

    const parentId =
      input.parentId === null || input.parentId === undefined
        ? null
        : await this.resolveValidParent(
            userId,
            input.parentId,
            input.type,
            null,
          );

    try {
      const record = await this.repository.create({
        userId,
        clientId: input.clientId,
        name: input.name,
        type: input.type,
        icon: input.icon ?? null,
        color: input.color ?? null,
        parentId,
        sortOrder,
        isPreset: false,
        isDefault,
        status: EntityStatus.Active,
      });
      return toCategoryPublic(record);
    } catch (err) {
      if (!this.isDuplicateKeyError(err)) {
        throw err;
      }
      const raced = await this.repository.findByNameAndType(
        userId,
        input.name,
        input.type,
      );
      if (raced) {
        throw this.categoryExists(input.name);
      }
      throw new AppError(
        500,
        ErrorCodes.Internal,
        "Could not create the category",
        { cause: err },
      );
    }
  }

  async list(
    userId: string,
    query: CategoryListQuery,
  ): Promise<CategoryPublic[]> {
    const records = await this.repository.listByUser(userId, {
      type: query.type,
    });
    return records.map(toCategoryPublic);
  }

  async findById(userId: string, id: string): Promise<CategoryPublic | null> {
    const record = await this.repository.findActiveById(userId, id);
    return record ? toCategoryPublic(record) : null;
  }

  async update(
    userId: string,
    id: string,
    input: UpdateCategoryData,
  ): Promise<CategoryPublic> {
    const existing = await this.repository.findActiveById(userId, id);
    if (!existing) {
      throw notFound("Category not found");
    }

    if (input.name !== undefined && input.name !== existing.name) {
      const conflict = await this.repository.findByNameAndType(
        userId,
        input.name,
        existing.type,
      );
      if (conflict) {
        throw this.categoryExists(input.name);
      }
    }

    let parentId: string | null | undefined;
    if (input.parentId !== undefined) {
      parentId =
        input.parentId === null
          ? null
          : await this.resolveValidParent(
              userId,
              input.parentId,
              existing.type,
              id,
            );
    }

    if (input.isDefault === true) {
      await this.repository.resetDefaults(userId, existing.type);
    }

    const record = await this.repository.update(userId, id, {
      name: input.name,
      icon: input.icon,
      color: input.color,
      parentId,
      sortOrder: input.sortOrder,
      status: input.status,
      isDefault: input.isDefault,
    });
    if (!record) {
      throw notFound("Category not found");
    }
    return toCategoryPublic(record);
  }

  async softDelete(
    userId: string,
    categoryId: string,
    deletedBy: string,
    reassignToId?: string | null,
  ): Promise<void> {
    const category = await this.repository.findById(userId, categoryId);
    if (!category) {
      throw notFound("Category not found");
    }
    if (category.deletedAt) {
      return;
    }

    if (reassignToId) {
      if (reassignToId === categoryId) {
        throw this.reassignTargetError(
          "cannot reassign to the category being deleted",
        );
      }
      const target = await this.repository.findActiveById(userId, reassignToId);
      if (!target) {
        throw this.reassignTargetError("reassign category was not found");
      }
      if (target.type !== category.type) {
        throw this.reassignTargetError(
          "reassign category type must match the deleted category",
        );
      }
      await this.transactionRepo.reassignCategory(
        userId,
        categoryId,
        reassignToId,
      );
    } else {
      const referencing = await this.transactionRepo.countByCategory(
        userId,
        categoryId,
      );
      if (referencing > 0) {
        throw new AppError(
          409,
          ErrorCodes.CategoryInUse,
          "Category is in use by transactions",
        );
      }
    }

    await this.repository.clearParent(userId, categoryId);
    await this.repository.softDelete(userId, categoryId, deletedBy);
  }

  async restoreDefaults(userId: string): Promise<CategoryPublic[]> {
    const restored: CategoryPublic[] = [];
    for (const item of DEFAULT_CATEGORY_CATALOG) {
      const existing = await this.repository.findByNameAndType(
        userId,
        item.name,
        item.type,
      );
      if (existing) {
        restored.push(toCategoryPublic(existing));
        continue;
      }
      let isDefault = item.isDefault;
      if (item.isDefault) {
        const currentDefault = await this.repository.findDefaultByType(
          userId,
          item.type,
        );
        if (currentDefault) {
          isDefault = false;
        }
      }
      const record = await this.repository.create({
        userId,
        clientId: randomUUID(),
        name: item.name,
        type: item.type,
        icon: item.icon,
        color: null,
        parentId: null,
        sortOrder: item.sortOrder,
        isPreset: true,
        isDefault,
        status: EntityStatus.Active,
      });
      restored.push(toCategoryPublic(record));
    }
    return restored;
  }

  private async resolveValidParent(
    userId: string,
    parentId: string,
    type: string,
    excludeId: string | null,
  ): Promise<string> {
    const parent = await this.repository.findActiveById(userId, parentId);
    if (!parent) {
      throw validationError("Request is invalid", [
        { field: "parentId", message: "parent category was not found" },
      ]);
    }
    if (parent.type !== type) {
      throw validationError("Request is invalid", [
        {
          field: "parentId",
          message: "parent category type must match the category type",
        },
      ]);
    }
    if (excludeId) {
      let cursor: string | null = parent.id;
      const seen = new Set<string>();
      while (cursor) {
        if (cursor === excludeId) {
          throw validationError("Request is invalid", [
            {
              field: "parentId",
              message: "parent hierarchy contains a cycle",
            },
          ]);
        }
        if (seen.has(cursor)) {
          throw validationError("Request is invalid", [
            {
              field: "parentId",
              message: "parent hierarchy contains a cycle",
            },
          ]);
        }
        seen.add(cursor);
        const ancestor = await this.repository.findById(userId, cursor);
        cursor = ancestor?.parentId ?? null;
      }
    }
    return parent.id;
  }

  private categoryExists(name: string): AppError {
    return new AppError(
      409,
      ErrorCodes.CategoryExists,
      `A category named "${name}" already exists for this type`,
    );
  }

  private reassignTargetError(message: string): AppError {
    return validationError("Request is invalid", [
      { field: "reassignToId", message },
    ]);
  }

  private isDuplicateKeyError(err: unknown): boolean {
    return (
      typeof err === "object" &&
      err !== null &&
      (err as { code?: number }).code === 11000
    );
  }
}
