import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import {
  clearDatabase,
  closeDatabase,
  createAccountRateLimiter,
  createTestApp,
  type TestApp,
} from "./helpers/test-app.js";
import { syncDbIndexes } from "../src/db/index.js";
import type { SlidingWindowRateLimiter } from "../src/lib/rate-limiter.js";

const PASSWORD = "CorrectHorseBattery1";

function withAuth(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

function txPayload(overrides: Record<string, unknown> = {}) {
  return {
    type: "expense",
    amountMinor: 12000,
    currency: "INR",
    transactionDate: "2026-01-05",
    ...overrides,
  };
}

function categoryPayload(overrides: Record<string, unknown> = {}) {
  return { name: randomUUID(), type: "expense", ...overrides };
}

function paymentMethodPayload(overrides: Record<string, unknown> = {}) {
  return { name: randomUUID(), kind: "wallet", ...overrides };
}

function pushOp(overrides: Record<string, unknown> = {}) {
  return { entity: "transactions", op: "create", clientId: randomUUID(), payload: {}, ...overrides };
}

type Envelope<T> = { data: T };

interface PushResultItem {
  op: string;
  entity: string;
  clientId: string;
  status: "applied" | "duplicate" | "conflict" | "rejected";
  id?: string;
  canonical?: { [key: string]: unknown } | null;
  reason?: string;
  conflict?: boolean;
}

interface Change {
  id: string;
  clientId?: string;
  entity: string;
  rev: number;
  updatedAt: string;
  deletedAt: string | null;
  deleted: boolean;
  changeType: "upsert" | "delete";
  payload: { [key: string]: unknown } | null;
}

describe("Sync API", () => {
  let app: TestApp["app"];
  let logger: TestApp["logger"];
  let accountRateLimiter: SlidingWindowRateLimiter;

  beforeAll(async () => {
    accountRateLimiter = createAccountRateLimiter(100);
    const ctx = await createTestApp({}, { accountRateLimiter });
    app = ctx.app;
    logger = ctx.logger;
  });

  beforeEach(async () => {
    await clearDatabase();
    await syncDbIndexes(logger);
    accountRateLimiter.resetAll();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  async function register(email: string) {
    await request(app)
      .post("/api/v1/auth/register")
      .send({ email, password: PASSWORD })
      .expect(201);
  }

  async function login(email: string, deviceName = "sync-test") {
    await register(email);
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: PASSWORD, device: { name: deviceName, platform: "web" } })
      .expect(200);
    return {
      accessToken: res.body.data.accessToken as string,
      userId: res.body.data.user.id as string,
    };
  }

  function push(
    accessToken: string,
    ops: unknown[],
    deviceId = "test-device",
  ) {
    return request(app)
      .post("/api/v1/sync/push")
      .set(withAuth(accessToken))
      .send({ deviceId, ops });
  }

  function changes(
    accessToken: string,
    query: Record<string, unknown> = {},
  ) {
    return request(app)
      .get("/api/v1/sync/changes")
      .set(withAuth(accessToken))
      .query(query);
  }

  function allChanges(res: request.Response): Change[] {
    const data = res.body.data as { itemsByEntity: Record<string, Change[]> };
    return Object.values(data.itemsByEntity ?? {}).flat();
  }

  describe("authentication", () => {
    it("rejects unauthenticated access to every sync endpoint", async () => {
      expect((await request(app).get("/api/v1/sync/bootstrap")).status).toBe(401);
      expect((await request(app).get("/api/v1/sync/changes")).status).toBe(401);
      expect((await request(app).get("/api/v1/sync/state")).status).toBe(401);
      expect((await request(app).post("/api/v1/sync/push").send({ deviceId: "d", ops: [] })).status).toBe(401);
    });
  });

  describe("GET /api/v1/sync/bootstrap", () => {
    it("returns an empty baseline for a fresh user and all entities", async () => {
      const { accessToken } = await login("fresh@example.com");
      const res = await request(app)
        .get("/api/v1/sync/bootstrap")
        .set(withAuth(accessToken));
      expect(res.status).toBe(200);
      const data = res.body.data as Envelope<{
        itemsByEntity: Record<string, Change[]>;
        nextCursor: string | null;
        hasMore: boolean;
      }>["data"];
      // Default catalog is seeded at registration, so categories exist.
      expect(data.itemsByEntity.categories).toBeDefined();
      expect(data.itemsByEntity.transactions ?? []).toHaveLength(0);
      expect(data.itemsByEntity["payment-methods"] ?? []).toHaveLength(0);
      expect(data.hasMore).toBe(false);
    });

    it("includes a pushed transaction, category and payment method in the next bootstrap", async () => {
      const { accessToken } = await login("bootstrap2@example.com");
      await push(accessToken, [
        pushOp({ entity: "transactions", op: "create", payload: txPayload() }),
        pushOp({
          entity: "categories",
          op: "create",
          payload: categoryPayload({ name: "Bootstrap Cat" }),
        }),
        pushOp({
          entity: "payment-methods",
          op: "create",
          payload: paymentMethodPayload({ name: "Bootstrap PM", kind: "wallet" }),
        }),
      ]).expect(200);

      const res = await request(app)
        .get("/api/v1/sync/bootstrap")
        .set(withAuth(accessToken));
      const changes_ = allChanges(res);
      expect(changes_.some((c) => c.entity === "categories" && c.payload?.name === "Bootstrap Cat")).toBe(true);
      expect(changes_.some((c) => c.entity === "payment-methods" && c.payload?.name === "Bootstrap PM")).toBe(true);
      expect(changes_.some((c) => c.entity === "transactions")).toBe(true);
    });
  });

  describe("POST /api/v1/sync/push", () => {
    it("creates a transaction, category and payment method", async () => {
      const { accessToken } = await login("push1@example.com");
      const tx = pushOp({ entity: "transactions", op: "create", payload: txPayload() });
      const cat = pushOp({ entity: "categories", op: "create", payload: categoryPayload({ name: "Cat A" }) });
      const pm = pushOp({ entity: "payment-methods", op: "create", payload: paymentMethodPayload({ name: "PM A" }) });

      const res = await push(accessToken, [tx, cat, pm]).expect(200);
      const results = res.body.data as { results: PushResultItem[] };
      expect(results.results.map((r) => r.status)).toEqual(["applied", "applied", "applied"]);
      expect(results.results.every((r) => r.id && typeof r.canonical === "object")).toBe(true);
    });

    it("replays a create idempotently and returns the same id", async () => {
      const { accessToken } = await login("push2@example.com");
      const op = pushOp({ entity: "transactions", op: "create", payload: txPayload() });
      const first = await push(accessToken, [op]).expect(200);
      const firstId = (first.body.data as { results: PushResultItem[] }).results[0]!.id;
      const second = await push(accessToken, [op]).expect(200);
      const secondResult = (second.body.data as { results: PushResultItem[] }).results[0]!;
      expect(secondResult.status).toBe("duplicate");
      expect(secondResult.id).toBe(firstId);
    });

    it("applies an update and bumps the revision", async () => {
      const { accessToken } = await login("push3@example.com");
      const op = pushOp({ entity: "transactions", op: "create", payload: txPayload() });
      const created = (await push(accessToken, [op]).expect(200)).body.data as { results: PushResultItem[] };
      const id = created.results[0]!.id!;
      expect((created.results[0]!.canonical as { rev: number }).rev).toBe(0);

      const upd = pushOp({
        entity: "transactions",
        op: "update",
        clientId: (op as { clientId: string }).clientId,
        baseRev: 0,
        id,
        payload: { merchant: "Updated Merchant" },
      });
      const res = await push(accessToken, [upd]).expect(200);
      const result = (res.body.data as { results: PushResultItem[] }).results[0]!;
      expect(result.status).toBe("applied");
      expect(result.id).toBe(id);
      expect((result.canonical as { rev: number }).rev).toBe(1);
      expect((result.canonical as { merchant: string }).merchant).toBe("Updated Merchant");
    });

    it("reports a conflict when baseRev is stale but still applies LWW", async () => {
      const { accessToken } = await login("push4@example.com");
      const op = pushOp({ entity: "transactions", op: "create", payload: txPayload() });
      const created = (await push(accessToken, [op]).expect(200)).body.data as { results: PushResultItem[] };
      const id = created.results[0]!.id!;
      const clientId = (op as { clientId: string }).clientId;

      // First update advances rev to 1.
      const upd1 = pushOp({ entity: "transactions", op: "update", clientId, baseRev: 0, id, payload: { merchant: "First" } });
      await push(accessToken, [upd1]).expect(200);

      // Second update based on stale baseRev 0 -> conflict but still applied.
      const upd2 = pushOp({ entity: "transactions", op: "update", clientId, baseRev: 0, id, payload: { merchant: "Second" } });
      const res = await push(accessToken, [upd2]).expect(200);
      const result = (res.body.data as { results: PushResultItem[] }).results[0]!;
      expect(result.status).toBe("conflict");
      expect(result.conflict).toBe(true);
      expect((result.canonical as { rev: number }).rev).toBe(2);
    });

    it("soft-deletes a transaction and reflects it as a tombstone", async () => {
      const { accessToken } = await login("push5@example.com");
      const op = pushOp({ entity: "transactions", op: "create", payload: txPayload() });
      const created = (await push(accessToken, [op]).expect(200)).body.data as { results: PushResultItem[] };
      const id = created.results[0]!.id!;
      const clientId = (op as { clientId: string }).clientId;

      const del = pushOp({ entity: "transactions", op: "delete", clientId, id });
      const res = await push(accessToken, [del]).expect(200);
      const result = (res.body.data as { results: PushResultItem[] }).results[0]!;
      expect(result.status).toBe("applied");
      expect((result.canonical as { deleted: boolean }).deleted).toBe(true);
      expect((result.canonical as { deletedAt: string }).deletedAt).toBeTruthy();

      const pull = await changes(accessToken).expect(200);
      const txc = allChanges(pull).find((c) => c.id === id);
      expect(txc).toBeDefined();
      expect(txc!.changeType).toBe("delete");
      expect(txc!.deleted).toBe(true);
      expect(txc!.deletedAt).toBeTruthy();
      expect(txc!.payload).toBeNull();
    });

    it("rejects an invalid create payload and marks it rejected", async () => {
      const { accessToken } = await login("push6@example.com");
      const bad = pushOp({ entity: "transactions", op: "create", payload: { amountMinor: -5 } });
      const res = await push(accessToken, [bad]).expect(200);
      const result = (res.body.data as { results: PushResultItem[] }).results[0]!;
      expect(result.status).toBe("rejected");
      expect(result.reason).toBe("validation_failed");
    });

    it("rejects an update for a missing entity", async () => {
      const { accessToken } = await login("push7@example.com");
      const op = pushOp({ entity: "transactions", op: "update", clientId: randomUUID(), id: new Types.ObjectId().toString(), baseRev: 0, payload: { merchant: "X" } });
      const res = await push(accessToken, [op]).expect(200);
      const result = (res.body.data as { results: PushResultItem[] }).results[0]!;
      expect(result.status).toBe("rejected");
      expect(result.reason).toBe("not_found");
    });

    it("rejects requests that violate the push body schema with 422", async () => {
      const { accessToken } = await login("push8@example.com");
      const res = await push(accessToken, [{ entity: "transactions", op: "create" }]);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("does not leak other users' entities", async () => {
      const alice = await login("alice@example.com");
      const bob = await login("bob2@example.com");
      const op = pushOp({ entity: "transactions", op: "create", payload: txPayload() });
      const created = (await push(alice.accessToken, [op]).expect(200)).body.data as { results: PushResultItem[] };
      const id = created.results[0]!.id!;

      // Bob cannot update Alice's transaction (unknown id).
      const upd = pushOp({
        entity: "transactions",
        op: "update",
        clientId: (op as { clientId: string }).clientId,
        id,
        baseRev: 0,
        payload: { merchant: "Hacked" },
      });
      const res = await push(bob.accessToken, [upd]).expect(200);
      const result = (res.body.data as { results: PushResultItem[] }).results[0]!;
      expect(result.status).toBe("rejected");
      expect(result.reason).toBe("not_found");
    });
  });

  describe("GET /api/v1/sync/changes", () => {
    it("advances the cursor and only returns new changes on subsequent pulls", async () => {
      const { accessToken } = await login("changes1@example.com");

      // Bootstrap to establish a baseline.
      const boot = await request(app).get("/api/v1/sync/bootstrap").set(withAuth(accessToken)).expect(200);
      const bootData = boot.body.data as { nextCursor: string | null };
      expect(bootData.nextCursor).toBeTruthy();

      const initialPull = await changes(accessToken, { cursor: bootData.nextCursor }).expect(200);
      expect(allChanges(initialPull)).toHaveLength(0);

      // Push two new transactions.
      const op1 = pushOp({ entity: "transactions", op: "create", payload: txPayload({ amountMinor: 2000, merchant: "A" }) });
      const op2 = pushOp({ entity: "transactions", op: "create", payload: txPayload({ amountMinor: 3000, merchant: "B" }) });
      await push(accessToken, [op1, op2]).expect(200);

      const pull = await changes(accessToken, { cursor: bootData.nextCursor }).expect(200);
      const pullData = pull.body.data as { nextCursor: string | null };
      const txChanges = allChanges(pull).filter((c) => c.entity === "transactions");
      expect(txChanges).toHaveLength(2);
      expect(pullData.nextCursor).toBeTruthy();

      const after = await changes(accessToken, { cursor: pullData.nextCursor }).expect(200);
      expect(allChanges(after)).toHaveLength(0);
    });

    it("paginates a large result set with hasMore and resumes from the cursor", async () => {
      const { accessToken } = await login("changes2@example.com");
      for (let i = 0; i < 5; i++) {
        await push(accessToken, [pushOp({ entity: "transactions", op: "create", payload: txPayload({ amountMinor: 1000 + i * 100, merchant: `Merchant ${i}` }) })]).expect(200);
      }

      const page1 = await changes(accessToken, { limit: 2, entities: "transactions" }).expect(200);
      const page1Data = page1.body.data as { itemsByEntity: Record<string, Change[]>; nextCursor: string | null; hasMore: boolean };
      expect((page1Data.itemsByEntity.transactions ?? []).length).toBe(2);
      expect(page1Data.hasMore).toBe(true);
      expect(page1Data.nextCursor).toBeTruthy();

      const page2 = await changes(accessToken, { limit: 2, cursor: page1Data.nextCursor, entities: "transactions" }).expect(200);
      const page2Data = page2.body.data as { itemsByEntity: Record<string, Change[]>; nextCursor: string | null; hasMore: boolean };
      expect((page2Data.itemsByEntity.transactions ?? []).length).toBe(2);

      const page3 = await changes(accessToken, { limit: 2, cursor: page2Data.nextCursor, entities: "transactions" }).expect(200);
      const page3Data = page3.body.data as { itemsByEntity: Record<string, Change[]>; nextCursor: string | null; hasMore: boolean };
      expect((page3Data.itemsByEntity.transactions ?? []).length).toBe(1);
      expect(page3Data.hasMore).toBe(false);
    });

    it("supports filtering to a single entity type", async () => {
      const { accessToken } = await login("changes3@example.com");
      await push(accessToken, [
        pushOp({ entity: "transactions", op: "create", payload: txPayload() }),
        pushOp({ entity: "categories", op: "create", payload: categoryPayload({ name: "Only Cat" }) }),
      ]).expect(200);

      const res = await changes(accessToken, { entities: "categories" }).expect(200);
      const data = res.body.data as { itemsByEntity: Record<string, Change[]> };
      expect(Object.keys(data.itemsByEntity)).toEqual(["categories"]);
      expect((data.itemsByEntity.categories ?? []).some((c: Change) => c.payload?.name === "Only Cat")).toBe(true);
    });

    it("rejects an invalid cursor with 422", async () => {
      const { accessToken } = await login("changes4@example.com");
      const res = await changes(accessToken, { cursor: "!!!not-a-valid-cursor!!!" });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/v1/sync/state", () => {
    it("tracks per-entity cursors after a pull", async () => {
      const { accessToken } = await login("state1@example.com");
      await push(accessToken, [pushOp({ entity: "transactions", op: "create", payload: txPayload() })]).expect(200);
      await changes(accessToken).expect(200);

      const res = await request(app).get("/api/v1/sync/state").set(withAuth(accessToken)).expect(200);
      const records = (res.body.data as { records: Array<{ entity: string; lastCursor: string | null; lastSyncAt: string | null }> }).records;
      const transactionRecord = records.find((r) => r.entity === "transactions");
      expect(transactionRecord).toBeDefined();
      expect(transactionRecord!.lastCursor).toBeTruthy();
      expect(transactionRecord!.lastSyncAt).toBeTruthy();
    });

    it("returns idle defaults before any sync activity", async () => {
      const { accessToken } = await login("state2@example.com");
      const res = await request(app).get("/api/v1/sync/state").set(withAuth(accessToken)).expect(200);
      const records = (res.body.data as { records: Array<{ entity: string; lastCursor: string | null; lastSyncAt: string | null; state: string }> }).records;
      expect(records).toHaveLength(3);
      expect(records.every((r) => r.state === "idle" && r.lastCursor === null)).toBe(true);
    });
  });

  describe("multi-device synchronization", () => {
    it("propagates a device A push to device B via B's pull", async () => {
      await register("multi@example.com");
      const deviceA = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "multi@example.com", password: PASSWORD, device: { name: "device-a", platform: "web" } })
        .expect(200);
      const deviceB = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "multi@example.com", password: PASSWORD, device: { name: "device-b", platform: "web" } })
        .expect(200);
      const tokenA = deviceA.body.data.accessToken as string;
      const tokenB = deviceB.body.data.accessToken as string;

      const op = pushOp({ entity: "transactions", op: "create", payload: txPayload() });
      await push(tokenA, [op]).expect(200);

      // Device B pulls and sees device A's transaction.
      const res = await changes(tokenB, { entities: "transactions" }).expect(200);
      const txChanges = allChanges(res).filter((c) => c.entity === "transactions");
      expect(txChanges).toHaveLength(1);
      expect(txChanges[0]!.payload).not.toBeNull();
    });

    it("keeps per-device cursors independent", async () => {
      await register("multi2@example.com");
      const deviceA = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "multi2@example.com", password: PASSWORD, device: { name: "device-a", platform: "web" } })
        .expect(200);
      const deviceB = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "multi2@example.com", password: PASSWORD, device: { name: "device-b", platform: "web" } })
        .expect(200);
      const tokenA = deviceA.body.data.accessToken as string;
      const tokenB = deviceB.body.data.accessToken as string;

      // Bootstrap both devices.
      await changes(tokenA).expect(200);
      await changes(tokenB).expect(200);

      // Device A advances its own cursor past a new transaction.
      await push(tokenA, [pushOp({ entity: "transactions", op: "create", payload: txPayload() })]).expect(200);
      await changes(tokenA, { entities: "transactions", limit: 1 }).expect(200);

      // Device B still sees the transaction because its cursor never advanced.
      const res = await changes(tokenB, { entities: "transactions" }).expect(200);
      expect(allChanges(res).filter((c) => c.entity === "transactions").length).toBeGreaterThan(0);
    });
  });
});
