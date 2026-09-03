import { offlineStore } from "../offline/index.js";

/**
 * The `settings` sync entity is a per-user singleton synced through the same
 * pipeline as transactions/payment-methods. Its single row is addressed by a
 * fixed, deterministic clientId so every device upserts the same record.
 */
export const INITIAL_BALANCE_CLIENT_ID =
  "00000000-0000-4000-8000-0000000000ab";

/** Read the user's synced starting balance (minor units). `0` if unset. */
export async function getInitialBalanceMinor(): Promise<number> {
  const doc = await offlineStore.get("settings", INITIAL_BALANCE_CLIENT_ID);
  return doc?.initialBalanceMinor ?? 0;
}

/** Set the user's starting balance and enqueue a sync op (read-your-writes). */
export async function setInitialBalanceMinor(minor: number): Promise<void> {
  const existing = await offlineStore.get(
    "settings",
    INITIAL_BALANCE_CLIENT_ID,
  );
  if (existing) {
    await offlineStore.update("settings", INITIAL_BALANCE_CLIENT_ID, {
      initialBalanceMinor: minor,
    });
  } else {
    await offlineStore.create("settings", {
      clientId: INITIAL_BALANCE_CLIENT_ID,
      initialBalanceMinor: minor,
    });
  }
}
