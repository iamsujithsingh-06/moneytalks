import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { closeDatabase, createTestApp, type TestApp } from "./helpers/test-app.js";

const EMAIL = "big-body@example.com";

describe("Health, security headers and misc", () => {
  let app: TestApp["app"];

  beforeAll(async () => {
    app = (await createTestApp()).app;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it("GET /health reports ok with database up", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.checks.database).toBe("up");
    expect(typeof res.body.uptimeSeconds).toBe("number");
  });

  it("unknown routes return the 404 error envelope", async () => {
    const res = await request(app).get("/api/v1/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.body.error.requestId).toBeTruthy();
    expect(res.body.error.retryable).toBe(false);
  });

  it("sets security headers and hides x-powered-by", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("echoes a client-provided request id", async () => {
    const res = await request(app)
      .get("/health")
      .set("X-Request-Id", "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    expect(res.headers["x-request-id"]).toBe(
      "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    );
  });

  it("allows an allowlisted CORS origin", async () => {
    const res = await request(app)
      .get("/health")
      .set("Origin", "http://localhost:5173");
    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
  });

  it("rejects a non-allowlisted CORS origin", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", "https://evil.example.com")
      .send({ email: "a@b.com", password: "x" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });

  it("rejects oversized bodies with 413", async () => {
    const big = "x".repeat(120 * 1024);
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: EMAIL, password: big });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });
});
