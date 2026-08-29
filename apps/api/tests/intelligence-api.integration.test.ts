import { randomUUID } from "node:crypto";
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

function txBody(overrides: Record<string, unknown> = {}) {
  return {
    clientId: randomUUID(),
    type: "expense",
    amountMinor: 1200,
    currency: "INR",
    transactionDate: "2026-03-15",
    ...overrides,
  };
}

describe("Intelligence API", () => {
  let app: TestApp["app"];
  let logger: TestApp["logger"];
  let accountRateLimiter: SlidingWindowRateLimiter;

  beforeAll(async () => {
    accountRateLimiter = createAccountRateLimiter(50);
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

  async function registerAndLogin(email: string) {
    await request(app)
      .post("/api/v1/auth/register")
      .send({ email, password: PASSWORD })
      .expect(201);
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email,
        password: PASSWORD,
        device: { name: "intelligence-test", platform: "web" },
      })
      .expect(200);
    return {
      accessToken: res.body.data.accessToken as string,
      userId: res.body.data.user.id as string,
    };
  }

  async function createTx(
    accessToken: string,
    overrides: Record<string, unknown> = {},
  ) {
    await request(app)
      .post("/api/v1/transactions")
      .set(withAuth(accessToken))
      .send(txBody(overrides))
      .expect(201);
  }

  describe("authentication", () => {
    it("requires a token on report and assistant", async () => {
      const report = await request(app).get("/api/v1/intelligence/report");
      expect(report.status).toBe(401);
      const assistant = await request(app)
        .post("/api/v1/intelligence/assistant")
        .send({ question: "how much did I spend?" });
      expect(assistant.status).toBe(401);
    });
  });

  it("returns a safe empty report for a user with no data", async () => {
    const { accessToken } = await registerAndLogin("int-empty@example.com");
    const res = await request(app)
      .get("/api/v1/intelligence/report")
      .set(withAuth(accessToken))
      .expect(200);

    const data = res.body.data;
    expect(data.insights).toEqual([]);
    expect(data.budgets).toEqual([]);
    expect(data.forecast.insufficientData).toBe(true);
    expect(data.forecast.points).toEqual([]);
    expect(data.recurring).toEqual([]);
    expect(data.anomalies).toEqual([]);
    expect(typeof data.generatedAt).toBe("string");
  });

  it("builds insight cards, forecast and recurring from real transactions", async () => {
    const { accessToken } = await registerAndLogin("int-data@example.com");
    await createTx(accessToken, { amountMinor: 500, merchant: "Cafe", transactionDate: "2026-03-10" });
    await createTx(accessToken, { amountMinor: 500, merchant: "Cafe", transactionDate: "2026-02-10" });
    await createTx(accessToken, { amountMinor: 500, merchant: "Cafe", transactionDate: "2026-01-10" });

    const res = await request(app)
      .get("/api/v1/intelligence/report")
      .set(withAuth(accessToken))
      .expect(200);

    const data = res.body.data;
    expect(data.insights.some((i: { kind: string }) => i.kind === "income-vs-expense")).toBe(true);
    // Three consistent monthly cafe expenses => recurring candidate.
    expect(data.recurring.some((r: { merchant: string }) => r.merchant === "Cafe")).toBe(true);
    // Enough history for a projection.
    expect(data.forecast.insufficientData).toBe(false);
    expect(data.forecast.isEstimate).toBe(true);
  });

  it("assistant answers total spend from real data", async () => {
    const { accessToken } = await registerAndLogin("int-assist@example.com");
    await createTx(accessToken, { amountMinor: 1000, transactionDate: "2026-03-10" });
    await createTx(accessToken, { amountMinor: 2000, transactionDate: "2026-03-12" });

    const res = await request(app)
      .post("/api/v1/intelligence/assistant")
      .set(withAuth(accessToken))
      .send({ question: "how much did I spend total?" })
      .expect(200);

    const turn = res.body.data;
    expect(turn.intent).toBe("total-spend");
    expect(turn.supported).toBe(true);
    expect(turn.answer).toContain("3000");
  });

  it("assistant politely declines an unsupported question", async () => {
    const { accessToken } = await registerAndLogin("int-unsupported@example.com");
    const res = await request(app)
      .post("/api/v1/intelligence/assistant")
      .set(withAuth(accessToken))
      .send({ question: "predict my stock portfolio growth" })
      .expect(200);

    const turn = res.body.data;
    expect(turn.supported).toBe(false);
    expect(turn.fallbackMessage).toBeTruthy();
  });

  it("isolates data between users (read-only, no cross-user leakage)", async () => {
    const alice = await registerAndLogin("int-a@example.com");
    const bob = await registerAndLogin("int-b@example.com");
    await createTx(alice.accessToken, { amountMinor: 5000, transactionDate: "2026-03-10" });

    const bobRes = await request(app)
      .post("/api/v1/intelligence/assistant")
      .set(withAuth(bob.accessToken))
      .send({ question: "how much did I spend total?" })
      .expect(200);

    // Bob sees nothing of Alice's spend.
    expect(bobRes.body.data.answer).not.toContain("5000");

    const aliceRes = await request(app)
      .post("/api/v1/intelligence/assistant")
      .set(withAuth(alice.accessToken))
      .send({ question: "how much did I spend total?" })
      .expect(200);
    expect(aliceRes.body.data.answer).toContain("5000");
  });

  it("rejects invalid assistant body with 422", async () => {
    const { accessToken } = await registerAndLogin("int-invalid@example.com");
    const res = await request(app)
      .post("/api/v1/intelligence/assistant")
      .set(withAuth(accessToken))
      .send({ question: "" })
      .expect(422);
    expect(res.body.error).toBeDefined();
  });
});
