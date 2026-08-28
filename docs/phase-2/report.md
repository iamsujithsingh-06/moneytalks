# Phase 2 Report — Backend Foundation + Authentication

**Status:** COMPLETE
**Date:** 2026-08-09
**Scope:** Monorepo foundation + MoneyTalks API backend (Express/TypeScript/Mongoose) with full JWT + rotating refresh-token authentication, per the frozen Phase 1 architecture.

## 1. Completed Tasks

| Requirement | Status |
| --- | --- |
| pnpm monorepo foundation | Done — workspaces `apps/*`, `packages/*` |
| API foundation (`apps/api`) | Done |
| Express + TypeScript strict mode | Done (`@moneytalks/config/tsconfig.base.json`, strict) |
| MongoDB/Mongoose connection | Done — retry with backoff, masked URI logging, index sync |
| Environment configuration + startup validation | Done — Zod-parsed `AppConfig`, prod JWT_SECRET ≥ 32 enforced |
| Zod validation (shared package) | Done — strict schemas, `formatZodError` |
| Structured Pino logging + request IDs | Done — pino + pino-http, `X-Request-Id`, redaction |
| Security middleware | Done — helmet (HSTS/frameguard/nosniff), CORS allowlist |
| CORS | Done — locked to allowlist, no wildcards |
| Rate limiting | Done — sliding-window, per-IP + per-account, 429 envelope |
| Centralized error handling | Done — `AppError`, standard `{ error: {...} }` envelope |
| Health endpoint | Done — `GET /health` with DB check |
| Graceful SIGTERM/SIGINT shutdown | Done — close HTTP, disconnect DB, force-exit timeout |
| User/Device/AuditLog data layer | Done — Mongoose models + auth repository |
| Argon2id password hashing | Done — `@node-rs/argon2`, `hash`/`verify`/`needsRehash` |
| JWT access tokens | Done — jose HS256, ~15 min TTL, `sub`/`deviceId`/`jti`/`tokenVersion` |
| Rotating hashed refresh tokens | Done — opaque 256-bit, SHA-256 hash on Device |
| Device/session tracking | Done — Device docs per login, fingerprints hashed |
| Refresh-token reuse detection | Done — `previousRefreshTokenHash` match → revoke family |
| Refresh-token family revocation | Done — revoke all devices in family + bump `tokenVersion` |
| Register / Login / Refresh / Logout / Logout-all / /me | Done — all endpoints |
| Deterministic auth integration tests | Done — in-memory Mongo, 49 tests passing |
| Typecheck / lint / tests / boot / shutdown verification | Done — all green (see §6) |

## 2. Files Created / Modified

### Monorepo root
- `pnpm-workspace.yaml` — workspaces + pnpm 11 `allowBuilds` map (esbuild, mongodb-memory-server, @node-rs/argon2)
- `package.json` — workspace scripts (`dev`, `build`, `typecheck`, `lint`, `format`, `test`), `packageManager: pnpm@11.20.0`
- `.npmrc`, `.gitignore`, `.prettierrc.json`, `.prettierignore`, `eslint.config.mjs` (flat config, typescript-eslint recommended)
- `README.md`
- `pnpm-lock.yaml`

### packages
- `packages/config` — `tsconfig.base.json` (strict, NodeNext), `prettier.config.mjs`
- `packages/shared` — `src/enums.ts` (UserStatus, DevicePlatform), `src/index.ts`
- `packages/types` — `src/auth.ts` (request/response types via `@moneytalks/validation`)
- `packages/validation` — `src/common.ts` (email/password/device schemas), `src/auth.ts` (register/login/refresh/logout schemas), `src/errors.ts` (formatZodError), `src/index.ts`

### apps/api — source (`apps/api/src`)
- `config/env.ts` — Zod-validated config, prod secret enforcement, secret fallback in dev only
- `lib/logger.ts` — pino + pino-http, redaction (Authorization/Cookie/Set-Cookie)
- `lib/errors.ts` — `AppError`, `ErrorCodes`, helpers
- `lib/response.ts` — `sendData`/`sendCreated`/`sendNoContent` envelope helpers
- `lib/tokens.ts` — `createRefreshToken` (randomBytes 32 → base64url), `hashToken` (SHA-256), `signAccessToken`/`verifyAccessToken` (jose HS256), `refreshTokenExpiry`
- `lib/password.ts` — Argon2id `hash`/`verify`/`passwordNeedsRehash`
- `lib/rate-limiter.ts` — `SlidingWindowRateLimiter` + `assertRateLimit` (in-memory; Redis replaces it in a later phase)
- `lib/shutdown.ts` — extracted `registerShutdownHooks` (returns `shutdown` for testability)
- `db/index.ts` — connect/disconnect/syncIndexes/isDbConnected, URI masking
- `db/models/user.ts` — User model (email unique lowercase, status, security.loginAttempts/lockedUntil, tokenVersion)
- `db/models/device.ts` — Device model (refreshTokenHash unique, previousRefreshTokenHash, refreshTokenFamily, revokedAt)
- `db/models/audit-log.ts` — AuditLog model
- `app-types/express.d.ts` — `req.requestId`, `req.validatedBody`, `req.auth` augmentation
- `middlewares/request-id.ts`, `security-headers.ts`, `cors.ts`, `rate-limit.ts`, `validation.ts`, `auth-guard.ts`, `error-handler.ts`, `not-found.ts`
- `modules/health/routes.ts` — health router
- `modules/auth/repository.ts` — data access (users/devices/audit logs)
- `modules/auth/service.ts` — register/login/refresh/logout/logoutAll/me logic
- `modules/auth/controller.ts` — HTTP adapter
- `modules/auth/routes.ts` — auth router (rate limit → validate → handle)
- `routes/v1.ts` — `/api/v1` mount
- `app.ts` — app factory (`createApp`) with injectable deps for tests
- `server.ts` — bootstrap + shutdown hooks

### apps/api — tests + verification
- `tests/helpers/global-setup.ts` — boots in-memory Mongo when `MONGODB_URI` unset
- `tests/helpers/test-app.ts` — `createTestApp`, `clearDatabase`, `closeDatabase`, `createAccountRateLimiter`
- `tests/auth.integration.test.ts` — register/login/refresh/logout/logout-all/me/reuse (22 tests)
- `tests/health.integration.test.ts` — health + security headers + not-found (8 tests)
- `tests/rate-limit.integration.test.ts` — 429 + Retry-After (1 test)
- `tests/unit/rate-limiter.test.ts` (5), `tests/unit/password.test.ts` (6), `tests/unit/tokens.test.ts` (7)
- `scripts/verify-boot-shutdown.ts` + `scripts/boot-shutdown-harness.ts` — consolidated boot + graceful-shutdown verification (run via `pnpm --filter @moneytalks/api verify`)
- `vitest.config.ts` — `fileParallelism: false`, `pool: "forks"`, global setup
- `.env.example`, `tsconfig.json`, `tsconfig.build.json`, `package.json`

## 3. Endpoints Implemented

All under `/api/v1` (mounted at `apps/api/src/routes/v1.ts`):

| Method | Path | Auth | Validation | Behavior |
| --- | --- | --- | --- | --- |
| GET | `/health` | — | — | DB check, 200/503 |
| POST | `/api/v1/auth/register` | — | registerSchema | 201 `{userId, emailVerified}`; 409 `EMAIL_EXISTS`; 422 |
| POST | `/api/v1/auth/login` | — | loginSchema | 200 tokens+deviceId+user; 401/403; per-IP + per-account limits |
| POST | `/api/v1/auth/refresh` | — | refreshSchema | rotates refresh token, 200 new pair; reuse → 401 `REFRESH_REUSE` + family revoke |
| POST | `/api/v1/auth/logout` | Bearer | logoutSchema | 204; revokes device |
| POST | `/api/v1/auth/logout-all` | Bearer | — | 204; revokes all devices + bump tokenVersion |
| GET | `/api/v1/auth/me` | Bearer | — | 200 `{user}` |

## 4. Database Models

- **User**: `email` (unique, lowercase), `passwordHash`, `name`, `emailVerifiedAt`, `status`, `defaultCurrency`, `preferences`, `security{loginAttempts, lockedUntil}`, `tokenVersion`, `deletedAt`; timestamps. Index: `status`.
- **Device**: `userId`, `deviceName`, `platform`, `deviceFingerprint` (SHA-256 hashed), `refreshTokenHash` (SHA-256 of opaque token, unique), `previousRefreshTokenHash`, `refreshTokenFamily`, `refreshTokenExpiresAt`, `lastSeenAt`, `revokedAt`, `revokedReason`; timestamps. Indexes: `userId`, `refreshTokenHash` (unique), `previousRefreshTokenHash`, `refreshTokenFamily`.
- **AuditLog**: `userId`, `actor`, `action`, `targetType`, `targetId`, `before`/`after` (Mixed), `ip`, `userAgent`, `requestId`; timestamps. Indexes: `{userId, createdAt}`, `{action, createdAt}`.

Raw passwords and raw refresh tokens are never stored.

## 5. Authentication Flow (per ADR-003)

1. **Register**: normalize email → reject duplicate → Argon2id hash → create User (`status=active`) → audit `auth.register`.
2. **Login**: per-account + per-IP rate limit → verify password → reset failures / lockout after N attempts → optional rehash → create Device with new opaque refresh token (SHA-256 hash stored) → sign access JWT (`sub`, `deviceId`, `jti`, `type=access`, `tokenVersion`) → audit `auth.login`.
3. **Refresh**: hash presented token → find Device (current or previous hash) → reuse detected if it matches `previousRefreshTokenHash` → revoke whole family + bump `tokenVersion` (401 `REFRESH_REUSE`) → else rotate (old hash → `previousRefreshTokenHash`, new hash stored) → new access token → new refresh token.
4. **Logout**: revoke the specific device (access tokens already issued remain valid only until expiry, but `auth-guard` rejects revoked devices with `DEVICE_REVOKED`).
5. **Logout-all**: revoke all user devices + bump `tokenVersion`; all previously issued access tokens become `TOKEN_REVOKED`.
6. **/me**: access token verified → user active + `tokenVersion` matches + device not revoked.

## 6. Verification Results

| Check | Command | Result |
| --- | --- | --- |
| Typecheck (5 packages) | `pnpm -r run typecheck` | PASS (0 errors) |
| Lint | `pnpm lint` | PASS (0 problems) |
| Tests | `pnpm --filter @moneytalks/api test` | PASS — 6 files, 49/49 tests |
| Build | `pnpm -r run build` | PASS |
| Boot verification | `pnpm --filter @moneytalks/api verify` | PASS — `/health` 200 `{"status":"ok","checks":{"database":"up"}}` |
| Graceful shutdown verification | same script | PASS — SIGINT → HTTP server closed → DB disconnected → exit 0 (all markers present) |

Test coverage highlights: registration (201, duplicate → 409, invalid email/password → 422, strict unknown-field → 422, lowercase normalization), login (tokens returned, generic 401s, lockout after failures, fresh device per login), /me (no/malformed/invalid token, valid token, DEVICE_REVOKED after logout, TOKEN_REVOKED after logout-all), refresh (rotation, reuse detection + family revocation, unknown token), logout-all (all sessions revoked), audit trail, rate limiting (429 + Retry-After), health/security headers, plus unit tests for rate limiter, Argon2id password, and JWT tokens (incl. expired-token rejection).

## 7. Issues / Assumptions / Deviations

- **`status=active` on registration** — email verification is explicitly deferred (Phase 2 scope is auth only; `verify-email` is not implemented). `emailVerifiedAt` stays `null` and `emailVerified: false` is returned.
- **In-memory rate limiter** — `SlidingWindowRateLimiter` is single-process only. A Redis-backed limiter replaces it when `infra/` (Redis) lands in a later phase (documented in ADR-003/SECURITY_ARCHITECTURE).
- **Test determinism** — the per-account login limiter accumulates in-memory across tests in a file, so tests inject a shared `accountRateLimiter` (via `createApp` deps) and reset it in `beforeEach`; integration tests boot an in-memory MongoDB (`mongodb-memory-server`) so they need no external services.
- **Dev-only TS source exports** — workspace packages export TS source directly (`"main": "./src/index.ts"`), dev-mode only. The `build` step type-checks `apps/api` into `dist/`, but runtime uses `tsx` (see `dev`/`start`/`verify` scripts). A proper production build with compiled workspace deps is a later-phase concern.
- **Duplicate index warning fixed** — User email index previously declared twice (field `unique` + explicit `schema.index`); the redundant explicit index was removed.
- **`sendCreated` status fix** — `sendCreated` originally called `.status(201)` after `.json()` had already flushed the response (returning 200); it now sets the status before sending. All 201 assertions pass.
- **Windows signal semantics** — `child.kill("SIGINT")` force-terminates the child on Windows (handler never runs), so the shutdown harness invokes the same `registerShutdownHooks` closure directly; this is the authoritative graceful-shutdown check on this platform.
- **Dev JWT secret fallback** — when `JWT_SECRET` is absent in non-production, a clearly-marked insecure fallback is used with a startup warning; production requires ≥ 32 characters or startup fails.

## 8. Confirmation: No Phase 3+ Features Implemented

The following were **NOT** implemented (and no code references them): transactions, expenses/income management, categories, budgets, analytics, SMS, Android functionality, OCR, AI, offline sync, PDF reports, import/export. This phase contains only the monorepo foundation, the API foundation, authentication, and their tests/verification.
