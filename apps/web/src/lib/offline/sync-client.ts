import type {
  SyncChangesResult,
  SyncEntity,
  SyncPushOp,
  SyncPushResult,
  SyncStateResult,
} from "@moneytalks/types";
import { apiClient } from "../api/index.js";

export interface SyncClientOptions {
  deviceId: () => string | null;
}

/**
 * Thin HTTP client over the sync endpoints. Reuses the shared ApiClient so
 * auth headers and token refresh are handled for us.
 */
export class SyncClient {
  constructor(private readonly options: SyncClientOptions) {}

  async bootstrap(): Promise<SyncChangesResult> {
    return apiClient.request<SyncChangesResult>("/sync/bootstrap");
  }

  async changes(
    entities: SyncEntity[],
    cursor?: string | null,
    limit = 200,
  ): Promise<SyncChangesResult> {
    const query: Record<string, string | number | undefined> = {
      limit,
      entities: entities.join(","),
    };
    if (cursor) query.cursor = cursor;
    return apiClient.request<SyncChangesResult>("/sync/changes", { query });
  }

  async push(ops: SyncPushOp[]): Promise<SyncPushResult> {
    const deviceId = this.options.deviceId();
    if (!deviceId) {
      throw new Error("sync.push requires a deviceId");
    }
    return apiClient.request<SyncPushResult>("/sync/push", {
      method: "POST",
      body: { deviceId, ops },
    });
  }

  async state(): Promise<SyncStateResult> {
    return apiClient.request<SyncStateResult>("/sync/state");
  }
}
