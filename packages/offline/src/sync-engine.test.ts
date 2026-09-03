import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  SyncChange,
  SyncEntity,
  SyncPushOp,
  SyncPushResult,
  SyncPushResultItem,
} from "@moneytalks/types";
import type { SyncClient } from "./sync-client.js";
import { SyncEngine, SYNC_ENTITIES } from "./sync-engine.js";
import { clearAll, getEntity, getMeta, getPendingOps, putEntity, setMeta, setOpStatus } from "./db.js";
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
    // A per-op `rejected` result must NOT flip the global status to "failed"
    // ("Sync error"); it is a recorded issue needing attention, not a sync
    // infrastructure failure.
    expect(engine.getSnapshot().status).toBe("conflict");
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

const SMS_PAYLOAD = {
  type: "expense" as const,
  amountMinor: 500,
  currency: "INR",
  transactionDate: "2026-09-02",
  merchant: "HARISH RAGAV",
  accountRef: "*3953",
  source: "sms",
  status: "confirmed",
  autoDetected: true,
  confidence: 0.91,
  bankSource: "indianbank",
  paymentMethodKind: "bank_transfer",
  smsRef: {
    upiRef: undefined,
    bankRef: "128925286398",
    messageHash: "abc123hash",
    receivedAt: "2026-09-02T09:30:00.000Z",
  },
};

describe("SyncEngine push failure recovery", () => {
  it("recovers inFlight ops when push throws", async () => {
    const { clientId } = await offlineStore.create("transactions", SMS_PAYLOAD);

    const client = makeClient();
    client.push = vi.fn(() =>
      Promise.reject(new Error("NetworkError")),
    ) as unknown as SyncClient["push"] & ReturnType<typeof vi.fn>;

    const engine = makeEngine(client);
    await engine.sync("manual");

    const pending = await getPendingOps();
    expect(pending).toHaveLength(1);
    // The op must be reset to `pending` so a retry can pick it up.
    expect(pending[0]!.clientId).toBe(clientId);
    expect(pending[0]!.status).toBe("pending");
  });

  it("re-pushes an op that failed once on a later sync", async () => {
    await offlineStore.create("transactions", SMS_PAYLOAD);

    const client = makeClient();
    let pushAttempts = 0;
    const firstPushOps: SyncPushOp[] = [];
    client.push = vi.fn((ops: SyncPushOp[]) => {
      pushAttempts += 1;
      if (pushAttempts === 1) {
        firstPushOps.push(...ops);
        return Promise.reject(new Error("NetworkError"));
      }
      return Promise.resolve({
        results: ops.map((o) => ({
          status: "applied",
          op: o.op,
          entity: o.entity,
          clientId: o.clientId,
          id: "srv-1",
          canonical: { id: "srv-1", clientId: o.clientId, rev: 1 },
        })),
      });
    }) as unknown as SyncClient["push"] & ReturnType<typeof vi.fn>;

    const engine = makeEngine(client);
    await engine.sync("manual");

    expect(firstPushOps[0]!.clientId).toBe(
      (await getPendingOps())[0]?.clientId ?? "",
    );

    const pending = await getPendingOps();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.status).toBe("pending");

    await engine.sync("manual");

    const pendingAfter = await getPendingOps();
    expect(pendingAfter).toHaveLength(0);
  });
});

describe("SyncEngine manualRun race condition", () => {
  it("flushes ops created mid-sync instead of leaving them pending", async () => {
    const client = makeClient();

    let resolveFirstPush!: (value: SyncPushResult) => void;
    let firstPushCalled = false;
    const firstPushPromise = new Promise<SyncPushResult>((resolve) => {
      resolveFirstPush = resolve;
    });

    client.push = vi.fn(() => {
      if (!firstPushCalled) {
        firstPushCalled = true;
        return firstPushPromise;
      }
      return Promise.resolve({
        results: [],
      });
    }) as unknown as SyncClient["push"] & ReturnType<typeof vi.fn>;

    const engine = makeEngine(client);

    await offlineStore.create("transactions", SMS_PAYLOAD);

    const sync1 = engine.sync("start");

    await vi.waitFor(() => {
      expect(client.push).toHaveBeenCalledTimes(1);
    });

    // A second SMS arrives mid-sync.
    const lateRes = await offlineStore.create("transactions", {
      ...SMS_PAYLOAD,
      merchant: "LATE_TX",
      amountMinor: 999,
    });

    // This manual sync is attempted while the first is in flight.
    await engine.sync("manual");

    // Resolve the first push with only the first transaction applied.
    resolveFirstPush({
      results: [
        {
          status: "applied",
          op: "create",
          entity: "transactions",
          clientId: (client.push.mock.calls[0]![0] as SyncPushOp[])[0]!.clientId,
          id: "srv-1",
          canonical: { id: "srv-1", rev: 1 },
        },
      ],
    });
    await sync1;

    // The second manual sync should have been re-triggered after the first
    // completed, and pushed the mid-sync op.
    await vi.waitFor(() => {
      expect(client.push.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    // Resolve any further pushes with the late tx applied.
    client.push.mockResolvedValue({
      results: [
        {
          status: "applied",
          op: "create",
          entity: "transactions",
          clientId: lateRes.clientId,
          id: "srv-late",
          canonical: { id: "srv-late", clientId: lateRes.clientId, rev: 1 },
        },
      ],
    } satisfies SyncPushResult);

    const pendingAfter = await getPendingOps();
    expect(pendingAfter).toHaveLength(0);
  });

  it("pushes pending ops on the next explicit sync after manualRun completes", async () => {
    await offlineStore.create("transactions", SMS_PAYLOAD);

    let resolvePush!: (value: SyncPushResult) => void;
    const pushPromise = new Promise<SyncPushResult>((resolve) => {
      resolvePush = resolve;
    });

    const client = makeClient();
    client.push = vi.fn(() => pushPromise) as unknown as SyncClient["push"] & ReturnType<typeof vi.fn>;

    const engine = makeEngine(client);

    const sync1 = engine.sync("start");

    await vi.waitFor(() => {
      expect(client.push).toHaveBeenCalledTimes(1);
    });

    await offlineStore.create("transactions", {
      ...SMS_PAYLOAD,
      merchant: "LATE_TX",
      amountMinor: 999,
    });

    await engine.sync("manual");

    resolvePush({
      results: [
        {
          status: "applied",
          op: "create",
          entity: "transactions",
          clientId: (client.push.mock.calls[0]![0] as SyncPushOp[])[0]!.clientId,
          id: "srv-1",
          canonical: { id: "srv-1", rev: 1 },
        },
      ],
    });
    await sync1;

    client.push.mockResolvedValue({
      results: [
        {
          status: "applied",
          op: "create",
          entity: "transactions",
          clientId: (await getPendingOps())[0]?.clientId ?? "",
          id: "srv-2",
          canonical: { id: "srv-2", rev: 1 },
        },
      ],
    });

    await engine.sync("manual");

    expect(client.push).toHaveBeenCalledTimes(2);
    const secondPushOps = client.push.mock.calls[1]![0] as SyncPushOp[];
    expect(secondPushOps[0]!.payload.merchant).toBe("LATE_TX");

    const pendingAfter = await getPendingOps();
    expect(pendingAfter).toHaveLength(0);
  });
});

describe("SyncEngine SMS transaction end-to-end", () => {
  it("pushes an SMS transaction with all fields intact", async () => {
    const { clientId } = await offlineStore.create("transactions", SMS_PAYLOAD);

    const pending = await getPendingOps();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.entity).toBe("transactions");
    expect(pending[0]!.op).toBe("create");
    expect(pending[0]!.clientId).toBe(clientId);
    expect(pending[0]!.payload).toMatchObject(SMS_PAYLOAD);

    const entityRecord = await getEntity(clientId);
    expect(entityRecord).toBeDefined();
    expect(entityRecord!.payload).toMatchObject(SMS_PAYLOAD);
    expect(entityRecord!.localDirty).toMatchObject(SMS_PAYLOAD);

    const pushPayload = { ...SMS_PAYLOAD, id: "", clientId, rev: 0, updatedAt: "2026-09-02T10:00:00.000Z" };
    const canonical = {
      ...pushPayload,
      id: "srv-sms-tx-1",
      clientId,
      rev: 1,
      updatedAt: "2026-09-02T10:00:00.000Z",
    };

    const client = makeClient();
    client.push = vi.fn(() =>
      Promise.resolve({
        results: [
          {
            status: "applied",
            op: "create",
            entity: "transactions",
            clientId,
            id: "srv-sms-tx-1",
            canonical,
          } as SyncPushResultItem,
        ],
      }),
    ) as unknown as SyncClient["push"] & ReturnType<typeof vi.fn>;

    const engine = makeEngine(client);
    await engine.sync("manual");

    expect(client.push).toHaveBeenCalledTimes(1);
    const sentOps = client.push.mock.calls[0]![0] as SyncPushOp[];
    expect(sentOps).toHaveLength(1);

    const sentOp = sentOps[0]!;
    expect(sentOp.entity).toBe("transactions");
    expect(sentOp.op).toBe("create");
    expect(sentOp.clientId).toBe(clientId);
    expect(sentOp.payload).toMatchObject(SMS_PAYLOAD);

    const rec = await getEntity(clientId);
    expect(rec!.id).toBe("srv-sms-tx-1");
    expect(rec!.rev).toBe(1);
    expect(rec!.payload).toMatchObject(canonical);
    expect(rec!.localDirty).toBeUndefined();

    const opsAfter = await getPendingOps();
    expect(opsAfter).toHaveLength(0);
  });

  it("preserves paymentMethodKind through the full outbox path", async () => {
    const { clientId } = await offlineStore.create("transactions", {
      ...SMS_PAYLOAD,
      paymentMethodKind: "upi",
    });

    const pending = await getPendingOps();
    expect(pending[0]!.payload.paymentMethodKind).toBe("upi");

    const client = makeClient();
    client.push = vi.fn(() =>
      Promise.resolve({
        results: [
          {
            status: "applied",
            op: "create",
            entity: "transactions",
            clientId,
            id: "srv-upi-1",
            canonical: {
              ...SMS_PAYLOAD,
              paymentMethodKind: "upi",
              id: "srv-upi-1",
              clientId,
              rev: 1,
            },
          },
        ],
      }),
    ) as unknown as SyncClient["push"] & ReturnType<typeof vi.fn>;

    const engine = makeEngine(client);
    await engine.sync("manual");

    const sentOps = client.push.mock.calls[0]![0] as SyncPushOp[];
    expect(sentOps[0]!.payload.paymentMethodKind).toBe("upi");
  });

  it("pushes multiple SMS transactions in a single batch", async () => {
    const tx1 = await offlineStore.create("transactions", {
      ...SMS_PAYLOAD,
      merchant: "ALICE",
      amountMinor: 100,
    });
    const tx2 = await offlineStore.create("transactions", {
      ...SMS_PAYLOAD,
      type: "income",
      merchant: undefined,
      counterparty: "BOB",
      amountMinor: 200,
    });

    const pending = await getPendingOps();
    expect(pending).toHaveLength(2);

    const client = makeClient();
    client.push = vi.fn(() =>
      Promise.resolve({
        results: [
          {
            status: "applied",
            op: "create",
            entity: "transactions",
            clientId: tx1.clientId,
            id: "srv-tx-1",
            canonical: { id: "srv-tx-1", clientId: tx1.clientId, rev: 1 },
          },
          {
            status: "applied",
            op: "create",
            entity: "transactions",
            clientId: tx2.clientId,
            id: "srv-tx-2",
            canonical: { id: "srv-tx-2", clientId: tx2.clientId, rev: 1 },
          },
        ],
      } satisfies SyncPushResult),
    ) as unknown as SyncClient["push"] & ReturnType<typeof vi.fn>;

    const engine = makeEngine(client);
    await engine.sync("manual");

    const sentOps = client.push.mock.calls[0]![0] as SyncPushOp[];
    expect(sentOps).toHaveLength(2);
    expect(sentOps[0]!.clientId).toBe(tx1.clientId);
    expect(sentOps[0]!.payload.merchant).toBe("ALICE");
    expect(sentOps[1]!.clientId).toBe(tx2.clientId);
    expect(sentOps[1]!.payload.type).toBe("income");

    const opsAfter = await getPendingOps();
    expect(opsAfter).toHaveLength(0);
  });

  it("does not send inFlight ops a second time in the same push cycle", async () => {
    await offlineStore.create("transactions", SMS_PAYLOAD);

    const client = makeClient();
    let callCount = 0;
    client.push = vi.fn(() => {
      callCount += 1;
      return Promise.resolve({
        results: [
          {
            status: "applied",
            op: "create",
            entity: "transactions",
            clientId: (client.push.mock.calls[0]![0] as SyncPushOp[])[0]!.clientId,
            id: "srv-tx-1",
            canonical: { id: "srv-tx-1", rev: 1 },
          },
        ],
      });
    }) as unknown as SyncClient["push"] & ReturnType<typeof vi.fn>;

    const engine = makeEngine(client);
    await engine.sync("manual");
    expect(callCount).toBe(1);
  });

  it("handles a rejected SMS transaction gracefully (generic rejection)", async () => {
    const { clientId } = await offlineStore.create("transactions", SMS_PAYLOAD);

    const client = makeClient();
    client.push = vi.fn(() =>
      Promise.resolve({
        results: [
          {
            status: "rejected",
            op: "create",
            entity: "transactions",
            clientId,
            reason: "validation_failed",
          } as SyncPushResultItem,
        ],
      }),
    ) as unknown as SyncClient["push"] & ReturnType<typeof vi.fn>;

    const engine = makeEngine(client);
    await engine.sync("manual");

    const rec = await getEntity(clientId);
    expect(rec).toBeDefined();

    const issues = (await getMeta("sync:issues")) as Array<{
      entity: SyncEntity;
      clientId: string;
      kind: "conflict" | "rejected";
      reason?: string;
    }>;
    expect(issues).toHaveLength(1);
    expect(issues[0]!.kind).toBe("rejected");
    expect(issues[0]!.reason).toContain("validation");

    const pending = await getPendingOps();
    expect(pending.find((o) => o.clientId === clientId)!.status).toBe("failed");
  });

  it("reconciles a duplicate_transaction create rejection to 'Synced' (dedup respected, no lingering issue)", async () => {
    const { clientId } = await offlineStore.create("transactions", SMS_PAYLOAD);

    const client = makeClient();
    client.push = vi.fn(() =>
      Promise.resolve({
        results: [
          {
            status: "rejected",
            op: "create",
            entity: "transactions",
            clientId,
            reason: "duplicate_transaction",
          } as SyncPushResultItem,
        ],
      }),
    ) as unknown as SyncClient["push"] & ReturnType<typeof vi.fn>;

    const engine = makeEngine(client);
    await engine.sync("manual");

    // The duplicate is reconciled: op cleared, local record kept but not dirty,
    // no rejected issue, and the UI status is "Synced" (not "Needs attention").
    const pending = await getPendingOps();
    expect(pending).toHaveLength(0);
    const rec = await getEntity(clientId);
    expect(rec).toBeDefined();
    expect(rec!.localDirty).toBeUndefined();
    expect(rec!.conflict).not.toBe(true);
    const issues = ((await getMeta("sync:issues")) as Array<{
      kind: string;
      clientId?: string;
    }> | undefined) ?? [];
    expect(issues.some((i) => i.clientId === clientId && i.kind === "rejected")).toBe(false);
    expect(engine.getSnapshot().status).toBe("synced");
  });
});

describe("SyncEngine reconcile pre-existing failed duplicate ops", () => {
  it("recovers an already-failed duplicate_transaction create op locally (no push loop, no app-data clear)", async () => {
    // Real-device state: an outbox op already marked `failed` with a matching
    // `rejected` issue reason `duplicate_transaction` (created on an older
    // build / before a fresh clientId). Because push() only sends `pending`
    // ops, this op will never be pushed again — it must be recovered by local
    // reconciliation, not by re-pushing.
    const { clientId } = await offlineStore.create("transactions", SMS_PAYLOAD);
    const op = (await getPendingOps()).find((o) => o.clientId === clientId)!;
    await setOpStatus(op.seq!, "failed");
    await setMeta("sync:issues", [
      { entity: "transactions", clientId, kind: "rejected", reason: "duplicate_transaction" },
    ]);

    const client = makeClient();
    const engine = makeEngine(client);
    await engine.refreshStatic(); // same local-reconcile path as app mount / every sync

    expect(client.push).not.toHaveBeenCalled();
    expect(await getPendingOps()).toHaveLength(0);
    const issues = (((await getMeta("sync:issues")) as
      | Array<{ kind: string; clientId?: string; reason?: string }>
      | undefined) ?? []);
    expect(issues.filter((i) => i.clientId === clientId)).toHaveLength(0);
    const rec = await getEntity(clientId);
    expect(rec).toBeDefined();
    expect(rec!.localDirty).toBeUndefined();
    const snap = engine.getSnapshot();
    expect(snap.status).toBe("synced");
    expect(snap.pendingCount).toBe(0);
  });

  it("does NOT reconcile a genuine validation/conflict failure (stays 'Needs attention')", async () => {
    const { clientId: cid } = await offlineStore.create("categories", {
      type: "expense",
      name: "Bad",
    });
    const op = (await getPendingOps()).find((o) => o.clientId === cid)!;
    await setOpStatus(op.seq!, "failed");
    await setMeta("sync:issues", [
      { entity: "categories", clientId: cid, kind: "rejected", reason: "validation_failed" },
    ]);

    const client = makeClient();
    const engine = makeEngine(client);
    await engine.refreshStatic();

    const pending = await getPendingOps();
    expect(pending.find((o) => o.clientId === cid)!.status).toBe("failed");
    const issues = (((await getMeta("sync:issues")) as
      | Array<{ kind: string; clientId?: string }>
      | undefined) ?? []);
    expect(issues.some((i) => i.clientId === cid && i.kind === "rejected")).toBe(true);
    expect(engine.getSnapshot().status).toBe("conflict");
  });
});
