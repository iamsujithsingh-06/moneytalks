import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { closeDatabase, createTestApp, type TestApp } from "./helpers/test-app.js";

describe("Rate limiting", () => {
  let app: TestApp["app"];

  beforeAll(async () => {
    app = (
      await createTestApp({
        AUTH_RATE_LIMIT_ENABLED: "true",
        AUTH_RATE_LIMIT_PER_MINUTE: "2",
        GENERAL_RATE_LIMIT_PER_MINUTE: "3",
      })
    ).app;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it("allows requests within the limit and returns 429 with Retry-After beyond it", async () => {
    const body = { refreshToken: "not-a-real-token" };

    const first = await request(app).post("/api/v1/auth/refresh").send(body);
    expect(first.status).toBe(401);

    const second = await request(app).post("/api/v1/auth/refresh").send(body);
    expect(second.status).toBe(401);

    const limited = await request(app).post("/api/v1/auth/refresh").send(body);
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("RATE_LIMITED");
    expect(limited.body.error.retryable).toBe(true);
    expect(limited.body.error.retryAfterSeconds).toBeGreaterThan(0);
    expect(limited.headers["retry-after"]).toBeTruthy();
    expect(limited.body.error.requestId).toBeTruthy();
  });

  it("throttles authenticated data endpoints with the general limiter", async () => {
    // The general per-IP limiter is mounted in front of data routers. Even
    // unauthenticated requests count toward it, so hammering the transactions
    // list must yield a 429 once the window is exhausted.
    let statuses = 0;
    for (let i = 0; i < 5; i++) {
      const res = await request(app).get("/api/v1/transactions");
      statuses = res.status;
      if (res.status === 429) break;
    }
    expect(statuses).toBe(429);
  });
});
