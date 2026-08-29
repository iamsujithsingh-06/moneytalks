import { SyncClient, SyncEngine } from "@moneytalks/offline";
import { apiClient } from "../api/index.js";
import { sessionStore } from "../session.js";

const deviceId = () => sessionStore.load().deviceId;

/** Shared sync client + engine singleton for the whole web app. */
export const syncClient = new SyncClient({
  request: <T>(path: string, options?: Parameters<typeof apiClient.request>[1]) =>
    apiClient.request<T>(path, options),
  deviceId,
});

export const syncEngine = new SyncEngine({
  client: syncClient,
  getDeviceId: deviceId,
});
