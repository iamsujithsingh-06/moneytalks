# Phase 3.2 Report — Transaction CRUD API

**Status:** COMPLETE
**Date:** 2026-08-09
**Scope:** Authenticated, user-scoped HTTP CRUD for transactions on top of the Phase 3.1 domain foundation — `POST /api/v1/transactions`, `GET /api/v1/transactions` (filter + cursor pagination), `GET /api/v1/transactions/:id`, `PATCH /api/v1/transactions/:id`, `DELETE /api/v1/transactions/:id` (soft-delete). **No categories, payment methods, budgets, savings goals, analytics, SMS/OCR/AI, offline sync, import/export, or PDF were implemented.**

## 1. Completed Tasks

| Requirement | Status |
| --- | --- |
| `POST /api/v1/transactions` (create, 201) | Done — reuses `createTransactionSchema` + `TransactionService.create` |
| `GET /api/v1/transactions` (list, 200) | Done — filters + cursor pagination (`limit`/`cursor` → `nextCursor`), `meta.total` |
| `GET /api/v1/transactions/:id` (get, 200 / 404) | Done — ObjectId param validation, soft-deleted excluded |
| `PATCH /api/v1/transactions/:id` (update, 200) | Done — safe partial update, fingerprint recompute, 409 on collision |
| `DELETE /api/v1/transactions/:id` (soft-delete, 204) | Done — sets `deletedAt`/`deletedBy`, excluded from reads, 404 on re-delete |
| All routes authenticated (`requireAuth`), every query scoped by `req.auth.userId` | Done |
| Controller + routes mirroring the auth module structure | Done — `createTransactionsController` / `createTransactionsRouter` |
| Shared Zod validation for body/query/params (`validateQuery`/`validateParams` added) | Done — `packages/validation/src/transactions.ts` |
| No cross-user access (404, never leaks existence) | Done — covered by test |
| No sensitive/internal DB fields leaked (`fingerprint`, `deletedAt`, `editedBy`, …) | Done — `TransactionPublic` unchanged |
| Deterministic integration tests for the required scenarios | Done — 17 new tests, all passing |
| Typecheck / lint / tests / build / boot / shutdown | Done — all green (see §6) |

## 2. Files Created / Modified

### Created
- `apps/api/src/modules/transactions/controller.ts` — `createTransactionsController(service)` (create/list/getById/update/deleteById), mirrors `createAuthController`.
- `apps/api/src/modules/transactions/routes.ts` — `createTransactionsRouter(deps)`; every route behind `requireAuth`, body/query/params validation.
- `apps/api/tests/transactions-api.integration.test.ts` — 17 tests covering all required scenarios.
- `docs/phase-3/2-transaction-crud/report.md` (this file).

### Modified
- `packages/validation/src/transactions.ts` — added `updateTransactionSchema` (strict partial; nullable clears; direction only for `transfer`/`adjustment`; rejects empty body), `transactionListQuerySchema` (limit/cursor + filters), `transactionParamsSchema` (`id` ObjectId); exported `UpdateTransactionInput/Data`, `TransactionListQueryInput/Data`, `TransactionParams`.
- `packages/types/src/transactions.ts` — added `TransactionUpdateRequest`, `TransactionListQuery`, `TransactionListResult`; re-exported the new validation types.
- `apps/api/src/modules/transactions/repository.ts` — added `list` (user-scoped, filters, `transactionDate:-1, _id:-1` sort, base64url cursor, `nextCursor` + `total`), `update` (sets `editedAt`/`editedBy`, `$inc editedCount/rev`), `softDelete` (sets `deletedAt`/`deletedBy`, `$inc rev`); `findById` now excludes soft-deleted docs.
- `apps/api/src/modules/transactions/service.ts` — added `list`, `update` (direction rules, fingerprint recompute + pre-check + E11000 backstop → 409), `softDelete`; kept `create`/`findById` semantics.
- `apps/api/src/middlewares/validation.ts` — added `validateQuery` / `validateParams` (additive to `validateBody`).
- `apps/api/src/app-types/express.d.ts` — added `validatedQuery` / `validatedParams` to `Express.Request`.
- `apps/api/src/routes/v1.ts` — mounted `/transactions`.
- `apps/api/src/app.ts` — builds `TransactionService`/`TransactionsController` (injectable `transactionsService` for tests), wired into `createV1Router`.

## 3. API Behaviour

- **Envelope:** success `{ data, meta: { requestId, ... } }` via `sendCreated`/`sendData`/`sendNoContent`; list adds `nextCursor` and `total` to `meta`. Errors use the existing envelope (422 validation, 401 auth, 404 not-found, 409 `DUPLICATE_TRANSACTION`).
- **Create:** unchanged from 3.1 — clientId idempotent replay, fingerprint dedupe → 409 with `duplicateOf`, defaults for `source`/`status`/`currency`, server-side direction derivation.
- **Update (`PATCH`):** identity fields (`userId`, `clientId`) and `source` are immutable (rejected by strict schema). `direction` is only settable for `transfer`/`adjustment`; changing `type` re-derives direction. `merchant`/`counterparty`/`note`/`categoryId`/`paymentMethodId`/`accountRef` accept `null` to clear. `editedAt`/`editedBy`/`editedCount`/`rev` are bumped server-side. Changing any fingerprint input (`amountMinor`, `currency`, `transactionDate`, `merchant`) recomputes the fingerprint; a collision with another transaction → 409 (pre-check + unique-index backstop). Empty body → 422.
- **Delete:** soft-delete only — sets `deletedAt` + `deletedBy` (+ `rev`). Soft-deleted transactions 404 on get and are excluded from list; the fingerprint stays active for dedupe during the retention window; a create replay with the same `clientId` still returns the existing (soft-deleted) record idempotently. Re-deleting → 404.
- **List:** filters `q` (regex over merchant/counterparty/note), `type`, `source`, `status`, `direction`, `categoryId`, `paymentMethodId`, `from`/`to` (calendar day, inclusive), `minAmount`/`maxAmount` (integer minor units), `merchant` (exact), `tags` (comma-separated or repeated params), `duplicatesOnly`. Sorted `transactionDate` desc, `_id` desc; cursor = base64url(`<dateISO>::<id>`); invalid cursor → 422. `limit` 1–100 (default 20).
- **Cross-user:** GET/PATCH/DELETE of another user's id → 404 (not 403) so resource existence is never revealed.

## 4. Verification Results

| Check | Command | Result |
| --- | --- | --- |
| Typecheck (5 packages) | `pnpm -r run typecheck` | PASS (0 errors) |
| Lint | `pnpm lint` | PASS (0 problems) |
| Tests | `pnpm --filter @moneytalks/api test` | PASS — 11 files, 113/113 tests (96 prior + 17 new) |
| Build | `pnpm -r run build` | PASS |
| Boot verification | `pnpm --filter @moneytalks/api verify` | PASS — `/health` 200, DB up, graceful shutdown markers all present |

New-test highlights: 401 without token; create 201 + envelope (no `fingerprint`/`deletedAt` leaked); invalid input & strict-keys → 422; clientId idempotent replay; same content under a new clientId → 409 + `duplicateOf`; list with `q`/`type`/`from`/`to`/`minAmount` filters; cursor pagination (2-page walk, no dupes, null on last page); invalid `limit` and undecodable `cursor` → 422; get single; malformed id → 422; unknown id → 404; PATCH bumps `rev`/`editedCount`; empty body & unknown fields → 422; explicit `direction` on `expense` → 422; PATCH colliding with an existing fingerprint → 409; soft-delete (204 → get 404 → list empty → re-delete 404); cross-user GET/PATCH/DELETE → 404 and list isolation.

## 5. Issues / Assumptions / Deviations

- **`q` search uses case-insensitive regex** over `merchant`/`counterparty`/`note` — no text index was built in 3.1; a real text index is deferred (worth revisiting with the ingestion phases).
- **Fingerprint pre-check on update** — the service re-checks the recomputed fingerprint before writing (mirroring `create`) and keeps the unique-index E11000 catch as a race backstop. This makes the API correct even if indexes are absent (e.g., test DBs after `dropDatabase`).
- **404 for cross-user access** — consistent with the error contract; reveals nothing about another user's data.
- **Soft-deleted docs still satisfy clientId/fingerprint dedupe** — intentional per Phase 1 retention semantics; the sync phase will add tombstone handling.
- **`duplicatesOnly` filter** — supported in the query schema and repository (matches `duplicateOf`/`duplicateGroup` being set). No manual-API path sets those fields yet, so the filter legitimately returns empty until ingestion phases populate them.
- **Cursor is opaque and versioned by sort** — an incompatible/decoded cursor yields 422 rather than a silent reset.
- **No audit-log wiring for transaction writes** — deferred (noted in the 3.1 report); auth's `writeAuditLog` remains reusable.

## 6. Confirmation: Scope Boundary

The following were **NOT** implemented: categories, payment methods, budgets, savings goals, analytics, SMS/OCR/AI, offline sync, import/export, PDF, and any new HTTP surface outside `/api/v1/transactions`. No auth code, Phase 2 behavior, or Phase 3.1 domain behavior was changed (all additions are additive). All previous tests remain green.
