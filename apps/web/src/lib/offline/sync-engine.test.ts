import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  SyncChange,
  SyncEntity,
  SyncPushOp,
  SyncPushResultItem,
} from "@moneytalks/types";
import type { SyncClient } from "./sync-client.js";
import { SyncEngine, SYNC_ENTITIES } from "./sync-engine.js";
import {
  clearAll,
  getEntity,
  getMeta,
  getPendingOps,
  putEntity,
} from "./db.js";
import { offlineStore } from "./offline-store.js";

function makeClient(changesByEntity?: Partial<Record<SyncEntity, SyncChange[]>>) {
  const changes = vi.fn(
    (entities: SyncEntity[], cursor?: string | null) => {
      const itemsByEntity: Partial<Record<SyncEntity, SyncChange[]>> = {};
      for (const e of entities) {
        itemsByEntity[e] = changesByEntity?.[e] ?? [];
      }
      return Promise.resolve({
        itemsByEntity,
        nextCursor: cursor ? null : "cursor-page-1",
        hasMore: false,
      });
    },
  );
  const push = vi.fn(() =>
    Promise.resolve({
      results: [] as SyncPushResultItem[],
    }),
  );
  const bootstrap = vi.fn();
  const state = vi.fn();
  return { changes, push, bootstrap, state } as unknown as SyncClient & {
    changes: ReturnType<typeof vi.fn>;
    push: ReturnType<typeof vi.fn>;
  };
}

function makeEngine(client: SyncClient) {
  return new SyncEngine({ client, getDeviceId: () => "device-1" });
}

beforeEach(async () => {
  await clearAll();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("SyncEngine pull", () => {
  it("advances the cursor and preserves local dirty fields on merge", async () => {
    const txChange: SyncChange = {
      id: "srv-tx-1",
      clientId: "t1",
      entity: "transactions",
      rev: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      changeType: "upsert",
      payload: {
        id: "srv-tx-1",
        clientId: "t1",
        rev: 1,
        updatedAt: "2026-01-01T00:00:00.000Z",
        type: "expense",
        amountMinor: 500,
        currency: "INR",
        transactionDate: "2026-01-01",
        merchant: "Coffee",
      },
    };
    const client = makeClient({ transactions: [txChange] });
    const engine = makeEngine(client);

    // Seed a locally-dirty record (no outbox op) with a differing field.
    await putEntity({
      entity: "transactions",
      clientId: "t1",
      id: "",
      rev: 0,
      updatedAt: "2026-01-01T00:00:00.000Z",
      payload: {
        id: "",
        clientId: "t1",
        rev: 0,
        type: "expense",
        amountMinor: 500,
        currency: "INR",
        transactionDate: "2026-01-01",
        merchant: "LocalEdit",
      },
      baseRev: null,
      localDirty: { merchant: "LocalEdit" },
    });

    await engine.sync("manual");

    const cursor = await getMeta("cursor:transactions");
    expect(cursor).toBe("cursor-page-1");

    const rec = await getEntity("t1");
    // The locally-modified field must survive the server merge.
    expect(rec!.localDirty).toMatchObject({ merchant: "LocalEdit" });
  });

  it("applies a tombstone pulled from the server", async () => {
    const catChange: SyncChange = {
      id: "srv-cat-1",
      clientId: "c1",
      entity: "categories",
      rev: 2,
      updatedAt: "2026-01-02T00:00:00.000Z",
      deletedAt: "2026-01-02T00:00:00.000Z",
      changeType: "delete",
      payload: null,
    };
    const client = makeClient({ categories: [catChange] });
    const engine = makeEngine(client);
    await engine.sync("manual");

    const rec = await getEntity("c1");
    expect(rec).toBeTruthy();
    expect(rec!.deleted).toBe(true);
  });
});

describe("SyncEngine push", () => {
  it("pushes a create op and applies the canonical server doc", async () => {
    const { doc } = await offlineStore.create("transactions", {
      type: "expense",
      amountMinor: 300,
      currency: "INR",
      transactionDate: "2026-01-03",
      merchant: "Lunch",
      clientId: "t-push",
    });

    const canonical = {
      ...(doc as object),
      id: "srv-tx-push",
      clientId: "t-push",
      rev: 1,
      updatedAt: "2026-01-03T12:00:00.000Z",
    } as Record<string, unknown>;

    const client = makeClient();
    client.push = vi.fn(() =>
      Promise.resolve({
        results: [
          {
            status: "applied",
            op: "create",
            entity: "transactions",
            clientId: "t-push",
            id: "srv-tx-push",
            canonical,
          } as SyncPushResultItem,
        ],
      }),
    ) as unknown as SyncClient["push"] & ReturnType<typeof vi.fn>;

    const engine = makeEngine(client);
    await engine.sync("manual");

    const sentOps = client.push.mock.calls[0]![0] as SyncPushOp[];
    expect(sentOps).toHaveLength(1);
    expect(sentOps[0]).toMatchObject({
      entity: "transactions",
      op: "create",
      clientId: "t-push",
    });

    const rec = await getEntity("t-push");
    expect(rec!.id).toBe("srv-tx-push");
    expect(rec!.rev).toBe(1);
    expect(rec!.localDirty).toBeUndefined();

    const pending = await getPendingOps();
    expect(pending).toHaveLength(0);
    expect(await getMeta("lastSyncAt")).toBeTruthy();
  });

  it("surfaces a conflict but keeps the local version", async () => {
    await offlineStore.create("transactions", {
      type: "expense",
      amountMinor: 10,
      currency: "INR",
      transactionDate: "2026-01-04",
      merchant: "Snack",
      clientId: "t-conf",
    });

    const client = makeClient();
    client.push = vi.fn(() =>
      Promise.resolve({
        results: [
          {
            status: "conflict",
            op: "create",
            entity: "transactions",
            clientId: "t-conf",
            conflict: true,
            reason: "Conflicting change detected.",
          } as SyncPushResultItem,
        ],
      }),
    ) as unknown as SyncClient["push"] & ReturnType<typeof vi.fn>;

    const engine = makeEngine(client);
    await engine.sync("manual");

    const rec = await getEntity("t-conf");
    expect(rec!.conflict).toBe(true);

    const issues = (await getMeta("sync:issues")) as Array<{
      entity: SyncEntity;
      clientId: string;
      kind: "conflict" | "rejected";
    }>;
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ entity: "transactions", clientId: "t-conf", kind: "conflict" });

    const pending = await getPendingOps();
    expect(pending.find((o) => o.clientId === "t-conf")!.status).toBe("failed");
  });

  it("marks a rejected op as failed and records the reason", async () => {
    await offlineStore.create("categories", {
      type: "expense",
      name: "Bad",
      clientId: "c-bad",
    });

    const client = makeClient();
    client.push = vi.fn(() =>
      Promise.resolve({
        results: [
          {
            status: "rejected",
            op: "create",
            entity: "categories",
            clientId: "c-bad",
            reason: "Validation failed.",
          } as SyncPushResultItem,
        ],
      }),
    ) as unknown as SyncClient["push"] & ReturnType<typeof vi.fn>;

    const engine = makeEngine(client);
    await engine.sync("manual");

    const issues = (await getMeta("sync:issues")) as Array<{
      kind: string;
      reason?: string;
    }>;
    expect(issues[0]!.kind).toBe("rejected");
    expect(issues[0]!.reason).toBe("Validation failed.");
    const pending = await getPendingOps();
    expect(pending.find((o) => o.clientId === "c-bad")!.status).toBe("failed");
    expect(engine.getSnapshot().status).toBe("failed");
  });
});

describe("SyncEngine reconnect", () => {
  it("switches to offline and syncs again on reconnect", async () => {
    const client = makeClient();
    const engine = makeEngine(client);

    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: false,
    });
    await engine.start();
    window.dispatchEvent(new Event("offline"));
    expect(engine.getSnapshot().online).toBe(false);
    expect(engine.getSnapshot().status).toBe("offline");

    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: true,
    });
    window.dispatchEvent(new Event("online"));
    await vi.waitFor(() => {
      expect(engine.getSnapshot().online).toBe(true);
    });
    // pull() should have been triggered by the reconnect
    await vi.waitFor(() => {
      expect(client.changes).toHaveBeenCalled();
    });
    await engine.stop();
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: true,
    });
  });
});

describe("SyncEngine entity scope", () => {
  it("only pulls the configured sync entities", async () => {
    const client = makeClient();
    const engine = makeEngine(client);
    await engine.sync("manual");
    const allArgs = client.changes.mock.calls
      .map((c) => c[0] as SyncEntity[])
      .flat();
    expect([...allArgs].sort()).toEqual([...SYNC_ENTITIES].sort());
    expect(engine.getSnapshot().status).toBe("synced");
  });
});
