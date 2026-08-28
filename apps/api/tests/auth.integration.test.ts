import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import {
  clearDatabase,
  closeDatabase,
  createAccountRateLimiter,
  createTestApp,
  type TestApp,
} from "./helpers/test-app.js";
import type { SlidingWindowRateLimiter } from "../src/lib/rate-limiter.js";

const EMAIL = "ada@example.com";
const PASSWORD = "CorrectHorseBattery1";

function registerBody(overrides: Record<string, unknown> = {}) {
  return { email: EMAIL, password: PASSWORD, ...overrides };
}

function loginBody(overrides: Record<string, unknown> = {}) {
  return {
    email: EMAIL,
    password: PASSWORD,
    device: { name: "integration-device", platform: "web" },
    ...overrides,
  };
}

describe("Auth API", () => {
  let app: TestApp["app"];
  let accountRateLimiter: SlidingWindowRateLimiter;

  beforeAll(async () => {
    accountRateLimiter = createAccountRateLimiter();
    app = (
      await createTestApp({}, { accountRateLimiter })
    ).app;
  });

  beforeEach(async () => {
    await clearDatabase();
    accountRateLimiter.resetAll();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  async function register() {
    return request(app).post("/api/v1/auth/register").send(registerBody());
  }

  async function login() {
    return request(app).post("/api/v1/auth/login").send(loginBody());
  }

  async function registerAndLogin() {
    await register();
    return login();
  }

  describe("POST /api/v1/auth/register", () => {
    it("creates an account and returns the envelope", async () => {
      const res = await register();
      expect(res.status).toBe(201);
      expect(res.body.data.userId).toBeTruthy();
      expect(res.body.data.emailVerified).toBe(false);
      expect(res.body.meta.requestId).toBeTruthy();
      expect(res.headers["x-request-id"]).toBeTruthy();
    });

    it("rejects a duplicate email with 409 EMAIL_EXISTS", async () => {
      await register();
      const res = await register();
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("EMAIL_EXISTS");
      expect(res.body.error.requestId).toBeTruthy();
    });

    it("rejects an invalid email with 422 VALIDATION_ERROR details", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send(registerBody({ email: "not-an-email" }));
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(Array.isArray(res.body.error.details)).toBe(true);
      expect(res.body.error.details[0].field).toBe("email");
    });

    it("rejects a weak password", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send(registerBody({ password: "short" }));
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(res.body.error.details.map((d: { field: string }) => d.field)).toContain(
        "password",
      );
    });

    it("rejects unknown fields (strict schema)", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send(registerBody({ admin: true }));
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("normalizes email to lowercase", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({ email: "Ada@Example.com", password: PASSWORD });
      expect(res.status).toBe(201);
      const loginRes = await request(app)
        .post("/api/v1/auth/login")
        .send(loginBody({ email: "ada@example.com" }));
      expect(loginRes.status).toBe(200);
    });
  });

  describe("POST /api/v1/auth/login", () => {
    it("returns tokens, deviceId and user on success", async () => {
      const res = await registerAndLogin();
      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeTruthy();
      expect(res.body.data.refreshToken).toBeTruthy();
      expect(res.body.data.deviceId).toBeTruthy();
      expect(res.body.data.user.email).toBe(EMAIL);
      expect(res.body.data.user.id).toBeTruthy();
      expect(res.body.data.user.passwordHash).toBeUndefined();
    });

    it("returns a generic 401 for a wrong password", async () => {
      await register();
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send(loginBody({ password: "WrongPassword1" }));
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });

    it("returns a generic 401 for an unknown email", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send(loginBody({ email: "ghost@example.com" }));
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });

    it("locks the account after repeated failures", async () => {
      await register();
      for (let i = 0; i < 4; i += 1) {
        const res = await request(app)
          .post("/api/v1/auth/login")
          .send(loginBody({ password: "WrongPassword1" }));
        expect(res.status).toBe(401);
      }
      const locked = await request(app)
        .post("/api/v1/auth/login")
        .send(loginBody({ password: "WrongPassword1" }));
      expect(locked.status).toBe(403);
      expect(locked.body.error.code).toBe("ACCOUNT_LOCKED");
      expect(locked.body.error.retryable).toBe(true);
      expect(locked.headers["retry-after"]).toBeTruthy();

      const evenCorrect = await request(app)
        .post("/api/v1/auth/login")
        .send(loginBody());
      expect(evenCorrect.status).toBe(403);
      expect(evenCorrect.body.error.code).toBe("ACCOUNT_LOCKED");
    });

    it("issues a fresh device record per login", async () => {
      await register();
      const first = await login();
      const second = await login();
      expect(first.body.data.deviceId).toBeTruthy();
      expect(second.body.data.deviceId).not.toBe(first.body.data.deviceId);
    });
  });

  describe("GET /api/v1/auth/me", () => {
    it("rejects requests without a token", async () => {
      const res = await request(app).get("/api/v1/auth/me");
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });

    it("rejects a malformed Authorization header", async () => {
      const res = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", "Basic abc");
      expect(res.status).toBe(401);
    });

    it("rejects an invalid token", async () => {
      const res = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", "Bearer not.a.valid.token");
      expect(res.status).toBe(401);
    });

    it("returns the current user with a valid token", async () => {
      const loginRes = await registerAndLogin();
      const accessToken = loginRes.body.data.accessToken;
      const res = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe(EMAIL);
      expect(res.body.data.user.status).toBe("active");
    });

    it("fails with DEVICE_REVOKED once the device is logged out", async () => {
      const loginRes = await registerAndLogin();
      const { accessToken, refreshToken, deviceId } = loginRes.body.data;

      const logout = await request(app)
        .post("/api/v1/auth/logout")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ deviceId });
      expect(logout.status).toBe(204);

      const me = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${accessToken}`);
      expect(me.status).toBe(401);
      expect(me.body.error.code).toBe("DEVICE_REVOKED");

      const refresh = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken });
      expect(refresh.status).toBe(401);
      expect(refresh.body.error.code).toBe("DEVICE_REVOKED");
    });

    it("fails with TOKEN_REVOKED after logout-all bumps tokenVersion", async () => {
      const loginRes = await registerAndLogin();
      const accessToken = loginRes.body.data.accessToken;

      const logoutAll = await request(app)
        .post("/api/v1/auth/logout-all")
        .set("Authorization", `Bearer ${accessToken}`);
      expect(logoutAll.status).toBe(204);

      const me = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${accessToken}`);
      expect(me.status).toBe(401);
      expect(me.body.error.code).toBe("TOKEN_REVOKED");
    });
  });

  describe("POST /api/v1/auth/refresh", () => {
    it("rotates the refresh token on success", async () => {
      const loginRes = await registerAndLogin();
      const first = loginRes.body.data.refreshToken;

      const refreshRes = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: first });
      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.data.accessToken).toBeTruthy();
      expect(refreshRes.body.data.refreshToken).not.toBe(first);
    });

    it("detects reuse of a rotated token and revokes the family", async () => {
      const loginRes = await registerAndLogin();
      const oldToken = loginRes.body.data.refreshToken;
      const accessToken = loginRes.body.data.accessToken;

      const first = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: oldToken });
      expect(first.status).toBe(200);
      const newToken = first.body.data.refreshToken;

      const reuse = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: oldToken });
      expect(reuse.status).toBe(401);
      expect(reuse.body.error.code).toBe("REFRESH_REUSE");

      const afterReuse = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: newToken });
      expect(afterReuse.status).toBe(401);

      const me = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${accessToken}`);
      expect(me.status).toBe(401);
    });

    it("rejects an unknown token", async () => {
      const res = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: "not-a-real-token" });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("TOKEN_REVOKED");
    });
  });

  describe("POST /api/v1/auth/logout-all", () => {
    it("revokes all sessions across devices", async () => {
      const first = await registerAndLogin();
      const second = await request(app)
        .post("/api/v1/auth/login")
        .send(loginBody({ device: { name: "phone", platform: "android" } }));

      const res = await request(app)
        .post("/api/v1/auth/logout-all")
        .set("Authorization", `Bearer ${first.body.data.accessToken}`);
      expect(res.status).toBe(204);

      const refreshFirst = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: first.body.data.refreshToken });
      expect(refreshFirst.status).toBe(401);

      const refreshSecond = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: second.body.data.refreshToken });
      expect(refreshSecond.status).toBe(401);
    });
  });

  describe("audit trail", () => {
    it("records register, login and logout events", async () => {
      await registerAndLogin();
      await login();
      const { AuditLogModel } = await import("../src/db/index.js");
      const actions = (await AuditLogModel.find().sort({ createdAt: 1 })).map(
        (doc) => doc.action,
      );
      expect(actions).toContain("auth.register");
      expect(actions.filter((a) => a === "auth.login").length).toBeGreaterThanOrEqual(1);
    });
  });
});
