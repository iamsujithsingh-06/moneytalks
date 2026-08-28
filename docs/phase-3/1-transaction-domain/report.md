# Phase 3.1 Report — Transaction Domain Foundation

**Status:** COMPLETE
**Date:** 2026-08-09
**Scope:** The transaction *domain foundation* only — shared enums, money helpers (integer minor units), fingerprint builder, Zod validation, TypeScript DTOs, the Mongoose `transactions` model with per-user unique indexes, and a repository + service foundation. **No HTTP routes, categories, payment methods, budgets, analytics, SMS/OCR/AI, or sync were implemented.**

## 1. Completed Tasks

| Requirement | Status |
| --- | --- |
| Shared transaction enums (5 types × 4 sources × 3 statuses + direction + categorizedBy) | Done — `packages/shared/src/enums.ts` |
| Money helpers — integer minor units, no floats, ISO 4217 support | Done — `packages/shared/src/money.ts` |
| Strict ISO 8601 calendar-day validation (rejects V8 rollover e.g. `2026-02-30`) | Done — `packages/shared/src/date.ts` |
| Direction derivation (`refund` of expense = `inflow`; `transfer`/`adjustment` accept explicit) | Done — `packages/shared/src/transactions.ts` |
| Canonical versioned duplicate fingerprint builder (`fp:v1:` + SHA-256) | Done — `packages/shared/src/fingerprint.ts` |
| Shared Zod validation (type, amount, currency, dates, source, status, clientId, refs, tags) | Done — `packages/validation/src/transactions.ts` |
| Public transaction DTO / request types | Done — `packages/types/src/transactions.ts` |
| Mongoose `Transaction` model (full §3.3 field set) + `{userId, clientId}` & `{userId, fingerprint}` unique indexes | Done — `apps/api/src/db/models/transaction.ts` |
| Repository abstraction + Mongo implementation | Done — `apps/api/src/modules/transactions/repository.ts` |
| Service foundation (`create` with userId scoping, clientId idempotency, fingerprint dedupe → 409) | Done — `apps/api/src/modules/transactions/service.ts` |
| `DUPLICATE_TRANSACTION` error code (additive to `ErrorCodes`) | Done — `apps/api/src/lib/errors.ts` |
| Deterministic unit + integration tests | Done — 47 new tests, all passing |
| Typecheck / lint / tests / build / boot / shutdown | Done — all green (see §6) |

## 2. Files Created / Modified

### Created
- `packages/shared/src/money.ts` — `minorUnitsPerMajor`, `SUPPORTED_CURRENCIES`, `MINOR_AMOUNT_MAX`, `isValidMinorUnitsAmount` / `isPositiveMinorUnitsAmount`, `toMinorUnits` / `fromMinorUnits`.
- `packages/shared/src/date.ts` — `isValidCalendarDay` (strict `YYYY-MM-DD`, catches out-of-range rollovers).
- `packages/shared/src/transactions.ts` — `deriveTransactionDirection(type, explicitDirection?)`.
- `packages/shared/src/fingerprint.ts` — `buildTransactionFingerprint`, `FINGERPRINT_VERSION`.
- `packages/validation/src/transactions.ts` — shared Zod schemas + `createTransactionSchema` (strict, defaults, direction superRefine), `CreateTransactionInput`/`CreateTransactionData`.
- `packages/types/src/transactions.ts` — `TransactionCreateRequest`, `TransactionPublic`.
- `apps/api/src/db/models/transaction.ts` — `TransactionModel` + `TransactionDocumentFields`, `SmsRefFields`/`ImportRefFields`/`OcrRefFields`.
- `apps/api/src/modules/transactions/repository.ts` — `TransactionRepository` interface + `createTransactionRepository()` + default `transactionRepository`.
- `apps/api/src/modules/transactions/service.ts` — `TransactionService` (create/findById), `toTransactionPublic`.
- `apps/api/tests/unit/transaction-money.test.ts` (17 tests)
- `apps/api/tests/unit/transaction-fingerprint.test.ts` (7 tests)
- `apps/api/tests/unit/transaction-validation.test.ts` (12 tests)
- `apps/api/tests/transaction-domain.integration.test.ts` (11 tests, in-memory Mongo)
- `docs/phase-3/1-transaction-domain/report.md` (this file)

### Modified
- `packages/shared/src/enums.ts` — added `TransactionType`, `TransactionSource`, `TransactionStatus`, `TransactionDirection`, `CategorizedBy`.
- `packages/shared/src/index.ts` — exports money/date/transactions/fingerprint.
- `packages/validation/src/index.ts` — exports transactions.
- `packages/types/src/index.ts` — exports transactions.
- `apps/api/src/db/index.ts` — exports `TransactionModel`.
- `apps/api/src/lib/errors.ts` — added `DuplicateTransaction: "DUPLICATE_TRANSACTION"`.

## 3. Transaction Model Summary (`apps/api/src/db/models/transaction.ts`)

Mirrors DATABASE_ARCHITECTURE §3.3. Required: `userId` (ref User), `clientId`, `type`, `source` (default `manual`), `status` (default `confirmed`), `direction`, `amountMinor` (positive safe integer — no floats), `currency` (uppercased, ≤ 3 chars), `transactionDate`. Optional: `merchant`, `counterparty`, `note`, `tags`, `categoryId`, `paymentMethodId`, `accountRef`, `fingerprint`, provenance subdocs (`smsRef`/`importRef`/`ocrRef` as `_id:false` sub-schemas), `confidence`/`confidenceDetail`, `categorizedBy`/`categoryConfidence`, `autoDetected`/`detectedAt`, review fields (`confirmedBy`/`confirmedAt`/`rejectedAt`/`rejectedReason`), edit fields (`editedAt`/`editedBy`/`editedCount`), duplicate fields (`duplicateOf`/`duplicateGroup`), soft-delete (`deletedAt`/`deletedBy`), `rev` (default 0), timestamps.

Indexes: `{userId, transactionDate:-1}`, `{userId, status, transactionDate:-1}`, `{userId, categoryId, transactionDate:-1}`, `{userId, source}`, `{userId, updatedAt}`, unique `{userId, clientId}`, unique `{userId, fingerprint}` with `partialFilterExpression: { fingerprint: { $type: "string" } }` (documents without a fingerprint are not constrained — verified by test).

## 4. Validation Summary (`packages/validation/src/transactions.ts`)

Zod schemas: `transactionTypeSchema`, `transactionSourceSchema` (default `manual`), `transactionStatusSchema` (default `confirmed`), `transactionDirectionSchema`, `amountMinorSchema` (positive safe integer, ≤ `MINOR_AMOUNT_MAX`), `currencySchema` (3-letter ISO 4217, validated against `SUPPORTED_CURRENCIES`, uppercased), `transactionDateSchema` (date-only `YYYY-MM-DD` or ISO datetime, strict calendar-day check), `clientIdSchema` (UUID), `fingerprintSchema`, `merchantSchema`, `counterpartySchema`, `noteSchema`, `tagsSchema` (≤ 20, ≤ 40 chars), `objectIdSchema` (+ `categoryId`/`paymentMethodId`), `accountRefSchema`, `categorizedBySchema`, `confidenceSchema`, and the strict `createTransactionSchema` which:
- applies defaults for `source`, `status`, `currency`;
- derives `direction` server-side and rejects a client-supplied `direction` for `income`/`expense`/`refund` (superRefine), while allowing it for `transfer`/`adjustment`;
- rejects unknown keys.

## 5. Fingerprint & Idempotency

- `buildTransactionFingerprint({amountMinor, currency, transactionDate, merchant?, source?})` produces `fp:v1:<sha256 hex>` over the canonical tuple `(business day, amountMinor, currency, normalized merchant, source)` — deterministic, case/whitespace/time-of-day normalized (string inputs canonicalize on the written calendar day; `Date` inputs on the UTC day).
- `TransactionService.create` is user-scoped and ordered: (1) clientId lookup → idempotent replay returns the existing transaction; (2) fingerprint lookup → 409 `DUPLICATE_TRANSACTION` with `duplicateOf` detail; (3) insert, with an E11000 race fallback that re-checks clientId before failing. A distinct `clientId` for identical content is treated as a duplicate (docs §6), so re-synced pushes can never insert twice.

## 6. Verification Results

| Check | Command | Result |
| --- | --- | --- |
| Typecheck (5 packages) | `pnpm -r run typecheck` | PASS (0 errors) |
| Lint | `pnpm lint` | PASS (0 problems) |
| Tests | `pnpm --filter @moneytalks/api test` | PASS — 10 files, 96/96 tests (49 Phase 2 + 47 new) |
| Build | `pnpm -r run build` | PASS |
| Boot verification | `pnpm --filter @moneytalks/api verify` | PASS — `/health` 200, DB up, graceful shutdown markers all present |

New-test highlights: all 5 types stored with derived direction; defaults applied; clientId idempotent replay; duplicate content → 409 `DUPLICATE_TRANSACTION` + `duplicateOf`; per-user isolation (clientId + fingerprint reuse across users allowed); unique `{userId, clientId}` and partial `{userId, fingerprint}` indexes (E11000); no-fingerprint documents unconstrained; model-layer enum/amount/required validation; validation schema rejection of bad type/amount/currency/date/uuid/strict-keys/direction; money conversion (incl. JPY 0-decimal), calendar-day strictness, fingerprint determinism + normalization.

## 7. Issues / Assumptions / Deviations

- **Fingerprint excludes `type`** — matches docs §6 fuzzy key `(date, amountMinor, currency, merchant, source)`. A `transfer` and `expense` with identical content collide intentionally (they are the same transaction).
- **`transfer`/`adjustment` direction** — ambiguous from type alone, so the schema permits an explicit `direction`; otherwise they default to `inflow` (documented in `deriveTransactionDirection`).
- **Fingerprint business day** — string inputs canonicalize on the written calendar day (deterministic, timezone-safe); `Date` inputs canonicalize on the UTC day. User-timezone-aware day extraction is deferred to the ingestion phases.
- **`clientId` is a UUID** — schema enforces `.uuid()`, matching Phase 1 examples; non-UUID client ids would be rejected.
- **`SUPPORTED_CURRENCIES`** — a curated list of 30 common ISO 4217 codes; extendable as markets grow.
- **Tests live in `apps/api/tests`** — the repo has a single central vitest runner (`pnpm test` → `apps/api`), so unit tests for the shared packages are co-located there rather than adding per-package runners.
- **No audit log on create yet** — the auth repository's `writeAuditLog` is reusable; wiring transaction writes into the audit trail is deferred until the CRUD routes phase.
- **`duplicate_fingerprints` support collection (§3.15)** — deliberately NOT created; Phase 3.1 delivers fingerprint support via the `{userId, fingerprint}` unique index on the transactions collection (the belt). The separate support collection (the braces) is deferred to the duplicate-detection phase.

## 8. Confirmation: Scope Boundary

The following were **NOT** implemented: `/transactions` CRUD or any HTTP route, categories, payment methods, budgets, savings goals, analytics, SMS/OCR/AI, offline sync, import/export, PDF. No auth code or Phase 2 behavior was modified (only an additive `ErrorCodes` entry). All Phase 2 tests remain green.
