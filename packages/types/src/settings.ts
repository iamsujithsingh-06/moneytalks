import type {
  CreateSettingsInput,
  UpdateSettingsInput,
} from "@moneytalks/validation";

export type {
  CreateSettingsData,
  CreateSettingsInput,
  UpdateSettingsData,
  UpdateSettingsInput,
} from "@moneytalks/validation";

export type SettingsCreateRequest = CreateSettingsInput;
export type SettingsUpdateRequest = UpdateSettingsInput;

/**
 * Per-user synced settings. Currently a lightweight singleton holding the
 * user's initial (starting) balance so the displayed balance can be
 * `initial + income - expenses`. This is NOT a transaction and never counts
 * toward income/expense itself.
 */
export interface SettingsPublic {
  id: string;
  userId: string;
  clientId: string;
  /** Current starting balance in minor units. `0` means unset. */
  initialBalanceMinor: number;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
  rev: number;
}
