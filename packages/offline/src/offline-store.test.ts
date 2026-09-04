import { beforeEach, describe, expect, it } from "vitest";
import { clearAll, getEntity, getPendingOps, putEntity } from "./db.js";
import { offlineStore } from "./offline-store.js";

describe("offlineStore", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("persists a created transaction and enqueues a create op atomically", async () => {
    const { doc, clientId } = await offlineStore.create("transactions", {
      type: "expense",
      amountMinor: 500,
      currency: "INR",
      transactionDate: "2026-01-05",
      merchant: "Coffee",
      clientId: "tx-abc",
    });

    expect(clientId).toBe("tx-abc");
    expect(doc.clientId).toBe("tx-abc");
    expect((doc as { merchant: string }).merchant).toBe("Coffee");

    const record = await getEntity("tx-abc");
    expect(record).toBeTruthy();
    expect(record!.entity).toBe("transactions");
    expect(record!.localDirty).toBeTruthy();

    const pending = await getPendingOps();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      entity: "transactions",
      op: "create",
      clientId: "tx-abc",
      status: "pending",
    });
  });

  it("list returns local records and excludes tombstones", async () => {
    await offlineStore.create("transactions", {
      type: "expense",
      amountMinor: 100,
      currency: "INR",
      transactionDate: "2026-02-01",
      clientId: "t1",
    });
    await offlineStore.create("transactions", {
      type: "income",
      amountMinor: 900,
      currency: "INR",
      transactionDate: "2026-02-02",
      clientId: "t2",
    });
    await offlineStore.remove("transactions", "t1");

    const all = await offlineStore.list("transactions");
    expect(all).toHaveLength(1);
    expect(all[0]!.clientId).toBe("t2");
  });

  it("update records dirty fields and enqueues an update op with baseRev", async () => {
    await offlineStore.create("transactions", {
      type: "expense",
      amountMinor: 100,
      currency: "INR",
      transactionDate: "2026-02-01",
      merchant: "A",
      clientId: "t1",
    });

    await clearAll();
    // re-seed with a server doc
    await putEntity({
      entity: "transactions",
      clientId: "t1",
      id: "server-id-1",
      rev: 3,
      updatedAt: "2026-02-01T00:00:00.000Z",
      payload: {
        id: "server-id-1",
        clientId: "t1",
        rev: 3,
        updatedAt: "2026-02-01T00:00:00.000Z",
        type: "expense",
        amountMinor: 100,
        currency: "INR",
        transactionDate: "2026-02-01",
        merchant: "A",
      },
      baseRev: 3,
    });

    await offlineStore.update("transactions", "t1", { merchant: "B" });

    const after = await getEntity("t1");
    expect((after!.payload as { merchant: string }).merchant).toBe("B");
    expect((after!.localDirty as Record<string, unknown>).merchant).toBe("B");

    const pending = await getPendingOps();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      entity: "transactions",
      op: "update",
      clientId: "t1",
      baseRev: 3,
      status: "pending",
    });
  });

  it("coalesces an update into a pending create (only one CREATE, latest values)", async () => {
    // Regression for the create-update race: updating a not-yet-synced record
    // must NOT leave a separate UPDATE op that could later conflict against the
    // newly-created server row. The pending CREATE is preserved and its payload
    // folded to the latest values.
    await offlineStore.create("transactions", {
      type: "expense",
      amountMinor: 100,
      currency: "INR",
      transactionDate: "2026-02-01",
      merchant: "A",
      clientId: "t-coalesce",
    });

    // Update before the create has synced.
    await offlineStore.update("transactions", "t-coalesce", { merchant: "B", amountMinor: 250 });

    const pending = await getPendingOps();
    // Exactly one op: the CREATE. No separate UPDATE.
    expect(pending).toHaveLength(1);
    expect(pending[0]!.op).toBe("create");
    expect(pending[0]!.clientId).toBe("t-coalesce");
    expect(pending[0]!.status).toBe("pending");

    // The CREATE payload carries the latest merged values.
    const createPayload = pending[0]!.payload as {
      merchant: string;
      amountMinor: number;
    };
    expect(createPayload.merchant).toBe("B");
    expect(createPayload.amountMinor).toBe(250);

    // Local record also holds the latest values (read-your-writes preserved).
    const rec = await getEntity("t-coalesce");
    expect((rec!.payload as { merchant: string }).merchant).toBe("B");
    expect((rec!.localDirty as Record<string, unknown>).merchant).toBe("B");
  });

  it("still enqueues an update op when the record already has a server identity", async () => {
    // Once a create has synced (record has an id/baseRev, no pending create),
    // updates continue to enqueue a normal UPDATE op.
    await putEntity({
      entity: "transactions",
      clientId: "t-synced",
      id: "server-id-9",
      rev: 1,
      updatedAt: "2026-02-01T00:00:00.000Z",
      payload: {
        id: "server-id-9",
        clientId: "t-synced",
        rev: 1,
        type: "expense",
        amountMinor: 100,
        currency: "INR",
        transactionDate: "2026-02-01",
        merchant: "A",
      },
      baseRev: 1,
    });

    await offlineStore.update("transactions", "t-synced", { merchant: "B" });

    const pending = await getPendingOps();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      entity: "transactions",
      op: "update",
      clientId: "t-synced",
      baseRev: 1,
      status: "pending",
    });
  });

  it("remove tombstones the record and enqueues a delete op", async () => {
    await offlineStore.create("transactions", {
      type: "expense",
      amountMinor: 50,
      currency: "INR",
      transactionDate: "2026-03-01",
      clientId: "t-rm",
    });

    await offlineStore.remove("transactions", "t-rm");

    const record = await getEntity("t-rm");
    expect(record!.deleted).toBe(true);

    const pending = await getPendingOps();
    const del = pending.find((o) => o.clientId === "t-rm" && o.op === "delete");
    expect(del).toBeTruthy();
    expect(del!.op).toBe("delete");
  });

  it("getById resolves a hydrated server record", async () => {
    await putEntity({
      entity: "categories",
      clientId: "c1",
      id: "cat-1",
      rev: 2,
      updatedAt: "2026-01-01T00:00:00.000Z",
      payload: { id: "cat-1", clientId: "c1", rev: 2, name: "Food" },
      baseRev: 2,
    });

    const doc = await offlineStore.getById("categories", "cat-1");
    expect((doc as { name: string }).name).toBe("Food");
  });
});
