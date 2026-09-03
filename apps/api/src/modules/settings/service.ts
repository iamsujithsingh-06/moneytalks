import type {
  CreateSettingsData,
  SettingsPublic,
  UpdateSettingsData,
} from "@moneytalks/types";
import { notFound } from "../../lib/errors.js";
import type { AppLogger } from "../../lib/logger.js";
import {
  settingsRepository,
  type SettingsRecord,
  type SettingsRepository,
} from "./repository.js";

export interface SettingsServiceDeps {
  logger: AppLogger;
  repository?: SettingsRepository;
}

export interface SettingsContext {
  userId: string;
}

function toSettingsPublic(record: SettingsRecord): SettingsPublic {
  return {
    id: record.id,
    userId: record.userId,
    clientId: record.clientId,
    initialBalanceMinor: record.initialBalanceMinor,
    deleted: record.deletedAt !== null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    rev: record.rev,
  };
}

export class SettingsService {
  private readonly repository: SettingsRepository;

  constructor(private readonly deps: SettingsServiceDeps) {
    this.repository = deps.repository ?? settingsRepository;
  }

  async create(
    input: CreateSettingsData,
    ctx: SettingsContext,
  ): Promise<SettingsPublic> {
    const record = await this.repository.create({
      userId: ctx.userId,
      clientId: input.clientId,
      initialBalanceMinor: input.initialBalanceMinor,
    });
    return toSettingsPublic(record);
  }

  async findByClientId(
    userId: string,
    clientId: string,
  ): Promise<SettingsPublic | null> {
    const record = await this.repository.findByClientId(userId, clientId);
    return record ? toSettingsPublic(record) : null;
  }

  async getForUser(userId: string): Promise<SettingsPublic | null> {
    const record = await this.repository.findByUser(userId);
    return record ? toSettingsPublic(record) : null;
  }

  async update(
    userId: string,
    id: string,
    input: UpdateSettingsData,
  ): Promise<SettingsPublic> {
    const record = await this.repository.update(userId, id, {
      initialBalanceMinor: input.initialBalanceMinor,
    });
    if (!record) {
      throw notFound("Settings not found");
    }
    return toSettingsPublic(record);
  }

  async softDelete(
    userId: string,
    id: string,
    deletedBy: string,
  ): Promise<void> {
    const existing = await this.repository.findByClientId(userId, id);
    const target = existing ?? (await this.repository.findByUser(userId));
    if (!target || target.deletedAt) return;
    await this.repository.softDelete(userId, target.id, deletedBy);
  }
}
