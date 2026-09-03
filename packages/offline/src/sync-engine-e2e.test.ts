import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncEntity, SyncPushOp, SyncPushResult } from "@moneytalks/types";
import type { RemoteRequest, RemoteRequestOptions } from "./transport.js";
import { SyncClient } from "./sync-client.js";
import { SyncEngine } from "./sync-engine.js";
import { offlineStore } from "./offline-store.js";
import { getEntity, getMeta, getOutbox, getPendingOps } from "./db.js";

function smsExpensePayload(merchant = "HARISH RAGAV") {
  return {
    type: "expense",
    amountMinor: 500,
    currency: "INR",
    transactionDate: "2026-09-02",
    merchant,
    accountRef: "*3953",
    source: "sms",
    status: "confirmed",
    autoDetected: true,
    confidence: 1,
    smsRef: { bankRef: "128925286398", receivedAt: "2026-09-02T09:30:00.000Z" },
  };
}

/** A second, distinct outgoing transaction (different merchant => distinct fingerprint). */
function smsExpensePayload2() {
  return {
    type: "expense",
    amountMinor: 500,
    currency: "INR",
    transactionDate: "2026-09-02",
    merchant: "KIRAN RAO",
    accountRef: "*3953",
    source: "sms",
    status: "confirmed",
    autoDetected: true,
    confidence: 1,
    smsRef: { bankRef: "128925286399", receivedAt: "2026-09-02T10:00:00.000Z" },
  };
}

function appliedResult(ops: SyncPushOp[]): SyncPushResult {
  return {
    results: ops.map((o) => ({
      status: "applied",
      op: o.op,
      entity: o.entity,
      clientId: o.clientId,
      id: "srv-" + o.clientId,
      canonical: {
        ...(o.payload as Record<string, unknown>),
        id: "srv-" + o.clientId,
        clientId: o.clientId,
        rev: 1,
      },
    })),
  };
}

/**
 * Controllable fake transport. Key capability: the Nth push can be HELD so a
 * sync stays in-flight while the app keeps running — exactly the real network
 * latency that lets an SMS op land mid-sync, after push() has already read its
 * batch.
 */
function buildServer() {
  const server = {
    pushedBatches: [] as SyncPushOp[][],
    pushHolds: [] as Array<null | { release?: (r: SyncPushResult) => void }>,
    pushOverrides: [] as Array<SyncPushResult | undefined>,
  };

  const request: RemoteRequest = async <T>(
    path: string,
    options?: RemoteRequestOptions,
  ) => {
    if (path === "/sync/changes" || path === "/sync/bootstrap") {
      return {
        itemsByEntity: {} as Record<SyncEntity, unknown[]>,
        nextCursor: null,
        hasMore: false,
      } as T;
    }
    if (path === "/sync/push") {
      const ops = (options?.body as { ops: SyncPushOp[] }).ops;
      const idx = server.pushedBatches.length;
      server.pushedBatches.push(ops);
      const override = server.pushOverrides[idx];
      const hold = server.pushHolds[idx];
      if (hold) {
        const result = await new Promise<SyncPushResult>((resolve) => {
          hold.release = resolve;
        });
        return (result ?? appliedResult(ops)) as T;
      }
      if (override) return override as T;
      return appliedResult(ops) as T;
    }
    throw new Error(`unexpected request path: ${path}`);
  };

  return { server, request };
}

describe("SyncEngine + real SyncClient end-to-end (SMS mid-sync reproduction)", () => {
  let server: ReturnType<typeof buildServer>["server"];
  let request: RemoteRequest;

  beforeEach(async () => {
    const { clearAll } = await import("./db.js");
    await clearAll();
    const built = buildServer();
    server = built.server;
    request = built.request;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("proves the mid-sync drop (no rerun) vs the rerun fix", async () => {
    const client = new SyncClient({ request, deviceId: () => "device-1" });
    const engine = new SyncEngine({ client, getDeviceId: () => "device-1" });

    // An unrelated op ensures startup push() actually issues an HTTP call we
    // can freeze (so doSync stays in-flight at the push layer).
    const seed = await offlineStore.create("transactions", smsExpensePayload("SEED"));
    const seedDisposedClientId = seed.clientId;

    // Hold push #0 (the startup sync's push) in flight.
    server.pushHolds[0] = {};
    const sync1 = engine.sync("start");

    // Wait until startup push is in-flight (server recorded batch 0).
    await vi.waitFor(() => {
      expect(server.pushedBatches.length).toBe(1);
    });
    console.log("[step1] startup sync in-flight during PUSH; batch0=",
      JSON.stringify(server.pushedBatches[0]!.map((o) => o.clientId)));

    // ---- Step 2-4: SMS arrives mid-sync -> Auto Expense + outbox op ----
    const { clientId } = await offlineStore.create("transactions", smsExpensePayload());
    const midSyncOp = (await getOutbox()).find((o) => o.clientId === clientId)!;
    expect(midSyncOp.status).toBe("pending");
    console.log("[step2] SMS clientId:", clientId);
    console.log("[step3] op status after create:", midSyncOp.status);

    // ---- Step 5: sync("manual") while startup sync still in-flight (pushed held) ----
    await engine.sync("manual");
    console.log("[step5] sync('manual') returned while manualRun=true");
    const statusAfterManual = (await getOutbox()).find(
      (o) => o.clientId === clientId,
    )!.status;
    console.log("[step5] op status right after sync('manual'):", statusAfterManual);
    expect(statusAfterManual).toBe("pending");

    // ---- Step 6: release the held startup push; it completes ----
    const release0 = server.pushHolds[0]!.release!;
    release0(appliedResult(server.pushedBatches[0]!));
    await sync1;
    console.log("[step6] startup sync completed (its push covered only the seed)");

    // ---- Step 7: rerun fix triggers a follow-up sync that pushes the SMS op ----
    await vi.waitFor(() => {
      expect(server.pushedBatches.length).toBeGreaterThanOrEqual(2);
    }, { timeout: 3000 });

    const secondBatch = server.pushedBatches[1]!;
    const ourOp = secondBatch.find((o) => o.clientId === clientId);
    expect(ourOp).toBeTruthy();
    console.log("[step7] second sync batch clientIds:",
      JSON.stringify(secondBatch.map((o) => o.clientId)));
    console.log("[step7] pushed op payload.merchant:",
      (ourOp!.payload as Record<string, unknown>).merchant);

    // ---- Step 8-10: server received it, push result was applied, op cleared ----
    await vi.waitFor(async () => {
      const outbox = await getOutbox();
      expect(outbox.find((o) => o.clientId === clientId)).toBeUndefined();
    }, { timeout: 3000 });
    await vi.waitFor(async () => {
      const outbox = await getOutbox();
      expect(outbox.find((o) => o.clientId === seedDisposedClientId)).toBeUndefined();
    }, { timeout: 3000 });

    const rec = await getEntity(clientId);
    expect(rec).toBeTruthy();
    expect(rec!.id).toBe("srv-" + clientId);
    expect(rec!.payload.merchant).toBe("HARISH RAGAV");
    expect(rec!.localDirty).toBeUndefined();

    const outbox = await getOutbox();
    const pending = await getPendingOps();
    console.log("[step10] final outbox size:", outbox.length, "pending:", pending.length);
    console.log("[step10] final rec.id:", rec!.id, "rev:", rec!.rev);
    expect(outbox).toHaveLength(0);
    console.log("[RESULT] server received the SMS tx (" + clientId + ") as 'applied'; op cleared.");
  });

  it("control: if sync('manual') is never flagged mid-sync, the op stays pending", async () => {
    const client = new SyncClient({ request, deviceId: () => "device-1" });
    const engine = new SyncEngine({ client, getDeviceId: () => "device-1" });

    // Seed ensures a push call we can hold, and the startup sync stays in-flight.
    const seed = await offlineStore.create("transactions", smsExpensePayload("SEED"));
    server.pushHolds[0] = {};
    const sync1 = engine.sync("start");
    await vi.waitFor(() => {
      expect(server.pushedBatches.length).toBe(1);
    });

    // SMS arrives mid-sync, but the app does NOT call sync('manual') afterwards.
    const { clientId } = await offlineStore.create("transactions", smsExpensePayload());

    const release0 = server.pushHolds[0]!.release!;
    release0(appliedResult(server.pushedBatches[0]!));
    await sync1;

    // No rerun was requested, so the mid-sync op is NOT pushed by the engine on
    // its own. It remains pending in the outbox (invisible to the server) until
    // the user / a later trigger syncs again.
    const outbox = await getOutbox();
    const ourOp = outbox.find((o) => o.clientId === clientId);
    expect(ourOp).toBeTruthy();
    expect(ourOp!.status).toBe("pending");
    console.log("[control] after startup sync, mid-sync op still pending (never auto-pushed):",
      ourOp!.clientId, "status:", ourOp!.status);
    void seed;
  });

  it("E: SyncEngine handles an HTTP-200 rejected per-op result (no throw, op failed)", async () => {
    const client = new SyncClient({ request, deviceId: () => "device-1" });
    const engine = new SyncEngine({ client, getDeviceId: () => "device-1" });

    const { clientId } = await offlineStore.create("transactions", smsExpensePayload());

    // Server returns HTTP 200 with a per-op `rejected` result for a NON-dedup
    // reason (e.g. validation failure) — the generic "hard rejection" path.
    server.pushOverrides[0] = {
      results: [
        {
          status: "rejected",
          op: "create",
          entity: "transactions",
          clientId,
          reason: "validation_failed",
        },
      ],
    };

    await engine.sync("manual");

    // The op is failed (terminal) and an issue is recorded — the generic
    // rejected path, which is surfaced as needing attention (not a hard error).
    const pending = await getPendingOps();
    const ourOp = pending.find((o) => o.clientId === clientId);
    expect(ourOp).toBeTruthy();
    expect(ourOp!.status).toBe("failed");
    console.log("[E] rejected result -> op status:", ourOp!.status);

    const issues = (await getMeta("sync:issues")) as Array<{
      kind: string;
      reason?: string;
      clientId: string;
    }>;
    expect(issues.some((i) => i.clientId === clientId && i.kind === "rejected")).toBe(true);
    console.log("[E] recorded issue kind:", issues.find((i) => i.clientId === clientId)?.kind,
      "reason:", issues.find((i) => i.clientId === clientId)?.reason);

    // The HTTP request itself did NOT throw (200), and push completed normally.
    expect(server.pushedBatches.length).toBe(1);
    // REGRESSION: an HTTP-200 push containing a `rejected` per-op result must
    // NOT flip the global sync status to "failed" (which the UI renders as
    // "Sync error"). It is a per-record issue, surfaced as needing attention.
    const snap = engine.getSnapshot();
    console.log("[E] global status after HTTP-200 rejected result:", snap.status,
      "| error:", snap.error);
    expect(snap.status).not.toBe("failed");
    expect(snap.status).toBe("conflict");
    // Terminal failed ops are NOT re-pushed; only pending ops are.
    server.pushOverrides[1] = undefined;
    await engine.sync("manual");
    expect(server.pushedBatches.length).toBe(1);
  });

  it("F: a rejected duplicate does NOT silently delete the local transaction", async () => {
    const client = new SyncClient({ request, deviceId: () => "device-1" });
    const engine = new SyncEngine({ client, getDeviceId: () => "device-1" });

    const { clientId } = await offlineStore.create("transactions", smsExpensePayload());
    const localPayload = (await getEntity(clientId))!.payload;

    server.pushOverrides[0] = {
      results: [
        {
          status: "rejected",
          op: "create",
          entity: "transactions",
          clientId,
          reason: "duplicate_transaction",
        },
      ],
    };

    await engine.sync("manual");

    // The local transaction record survives with its full payload — it is NOT
    // deleted or emptied when the server rejects it as a duplicate.
    const rec = await getEntity(clientId);
    expect(rec).toBeTruthy();
    expect(rec!.deleted).not.toBe(true);
    expect(rec!.payload).toMatchObject(localPayload as Record<string, unknown>);
    console.log("[F] local tx preserved after rejection; merchant:",
      (rec!.payload as Record<string, unknown>).merchant, "; deleted:", rec!.deleted);
  });

  it("G: real Android scenario — HTTP-200 per-op `rejected: duplicate_transaction` is reconciled to 'Synced' (no 'Sync error', no lingering attention)", async () => {
    const client = new SyncClient({ request, deviceId: () => "device-1" });
    const engine = new SyncEngine({ client, getDeviceId: () => "device-1" });

    // Mirrors the logged runtime: a fresh device re-creates an SMS transaction
    // that already exists server-side (same fingerprint, different clientId).
    // The server answers /sync/push with HTTP 200 but per-op `rejected` with
    // reason `duplicate_transaction`.
    const { clientId } = await offlineStore.create("transactions", smsExpensePayload());
    server.pushOverrides[0] = {
      results: [
        {
          status: "rejected",
          op: "create",
          entity: "transactions",
          clientId,
          reason: "duplicate_transaction",
        },
      ],
    };

    await engine.sync("manual");

    // The duplicate is reconciled: the pending op is cleared, no rejected issue
    // lingers, and the UI-facing status returns to "Synced" — NOT "failSync"
    // and NOT a perpetual "Needs attention".
    const snap = engine.getSnapshot();
    console.log("[G] UI-facing status after HTTP-200 duplicate_transaction:", snap.status,
      "pendingCount:", snap.pendingCount);
    expect(snap.status).toBe("synced");
    expect(snap.pendingCount).toBe(0);

    const pending = await getPendingOps();
    expect(pending).toHaveLength(0);
    const issues = ((await getMeta("sync:issues")) as Array<{
      kind: string;
      clientId?: string;
    }> | undefined) ?? [];
    expect(issues.some((i) => i.clientId === clientId && i.kind === "rejected")).toBe(false);
    // The local record is preserved (not silently deleted) but no longer dirty.
    const rec = await getEntity(clientId);
    expect(rec).toBeTruthy();
    expect(rec!.deleted).not.toBe(true);
    expect(rec!.localDirty).toBeUndefined();
  });

  it("H: regression — 2 duplicate-transaction rejections reconcile to 'Synced', and 'Sync now' pushes nothing further", async () => {
    const client = new SyncClient({ request, deviceId: () => "device-1" });
    const engine = new SyncEngine({ client, getDeviceId: () => "device-1" });

    // Fresh device re-created two transactions (e.g. incoming + outgoing ₹5 SMS)
    // that already exist server-side from a prior sync on another device. Each
    // create is enqueued as a pending op.
    const a = await offlineStore.create("transactions", smsExpensePayload("HARISH RAGAV"));
    const b = await offlineStore.create("transactions",
      smsExpensePayload2()); // distinct merchant so fingerprints differ
    const ids = [a.clientId, b.clientId];

    // Server returns HTTP 200 with a per-op `rejected` (duplicate) for both.
    server.pushOverrides[0] = {
      results: ids.map((clientId) => ({
        status: "rejected",
        op: "create",
        entity: "transactions",
        clientId,
        reason: "duplicate_transaction",
      })),
    };

    // ---- First sync: both duplicates are reconciled (not left failed) ----
    await engine.sync("manual");
    const pending = await getPendingOps();
    console.log("[H] sync#1 -> status:", engine.getSnapshot().status,
      "pendingCount:", engine.getSnapshot().pendingCount, "outbox:", pending.length);
    expect(engine.getSnapshot().status).toBe("synced");
    expect(engine.getSnapshot().pendingCount).toBe(0);
    expect(pending).toHaveLength(0);
    const issues = ((await getMeta("sync:issues")) as Array<{ kind: string; clientId?: string }> | undefined) ?? [];
    expect(issues.filter((i) => ids.includes(i.clientId as string))).toHaveLength(0);

    // ---- "Sync now" again: nothing left to push, state unchanged & healthy ----
    await engine.sync("manual");
    expect(server.pushedBatches.length).toBe(1); // did NOT re-push the resolved ops
    expect(engine.getSnapshot().status).toBe("synced");
    expect(engine.getSnapshot().pendingCount).toBe(0);
    console.log("[H] sync#2 (Sync now) -> status:", engine.getSnapshot().status,
      "pendingCount:", engine.getSnapshot().pendingCount, "pushed:", server.pushedBatches.length);
  });
});
