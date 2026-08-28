import { sessionStore } from "../session.js";
import { SyncClient } from "./sync-client.js";
import { SyncEngine } from "./sync-engine.js";

const deviceId = () => sessionStore.load().deviceId;

/** Shared sync client + engine singleton for the whole app. */
export const syncClient = new SyncClient({ deviceId });

export const syncEngine = new SyncEngine({
  client: syncClient,
  getDeviceId: deviceId,
});
