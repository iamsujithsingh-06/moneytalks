import type {
  SyncChangesResult,
  SyncEntity,
  SyncPushOp,
  SyncPushResult,
  SyncStateResult,
} from "@moneytalks/types";
import type { RemoteRequest, RemoteRequestOptions } from "./transport.js";

export interface SyncClientOptions {
  /** Adapter over the host HTTP client (auth + refresh handled by it). */
  request: RemoteRequest;
  deviceId?: () => string | null;
}

/**
 * Thin HTTP client over the sync endpoints. Delegates all HTTP concerns to an
 * injectable `request` adapter (web's ApiClient, a platform fetch wrapper, ...)
 * so auth headers and token refresh stay the host's responsibility.
 */
export class SyncClient {
  constructor(private readonly options: SyncClientOptions) {}

  async bootstrap(): Promise<SyncChangesResult> {
    return this.options.request<SyncChangesResult>("/sync/bootstrap");
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
    return this.options.request<SyncChangesResult>("/sync/changes", {
      query,
    } as RemoteRequestOptions);
  }

  async push(ops: SyncPushOp[]): Promise<SyncPushResult> {
    const deviceId = this.options.deviceId?.();
    if (!deviceId) {
      throw new Error("sync.push requires a deviceId");
    }
    return this.options.request<SyncPushResult>("/sync/push", {
      method: "POST",
      body: { deviceId, ops },
    });
  }

  async state(): Promise<SyncStateResult> {
    return this.options.request<SyncStateResult>("/sync/state");
  }
}
