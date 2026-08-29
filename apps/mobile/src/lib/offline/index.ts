import { newClientId } from "../constants.js";
import { apiClient } from "../api/index.js";
import { sessionStore } from "../session.js";
export {
  offlineStore,
  SyncClient,
  SyncEngine,
  openDB,
  getEntity,
  getAllEntities,
  getPendingOps,
  clearAll,
  type SyncSnapshot,
  type SyncIssue,
  type SyncStatusValue,
} from "@moneytalks/offline";
import { SyncClient, SyncEngine } from "@moneytalks/offline";
import type { Session } from "../session.js";

const deviceId = () => sessionStore.load().deviceId;

export const syncClient = new SyncClient({
  request: <T>(path: string, options?: Parameters<typeof apiClient.request>[1]) =>
    apiClient.request<T>(path, options),
  deviceId,
});

export const syncEngine = new SyncEngine({
  client: syncClient,
  getDeviceId: deviceId,
});

/** Ensure a deviceId exists for this device before sync can run. */
export function ensureDeviceId(): string {
  const existing = sessionStore.load().deviceId;
  if (existing) return existing;
  const id = newClientId();
  sessionStore.setDeviceId(id);
  return id;
}

export function session(): Session {
  return sessionStore.load();
}
