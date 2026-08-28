# MoneyTalks — User Flows (Phase 1)

> Status: Approved. Every flow below is written for product/architecture clarity.
> Implementation order and priority are governed by `PRODUCT_REQUIREMENTS.md` and `ROADMAP.md`.

Each flow follows this template:

- **Actor** — who/what initiates
- **Trigger** — what starts the flow
- **Preconditions** — must be true before the flow begins
- **Main flow** — happy path steps
- **Alternative flow** — acceptable variations
- **Failure cases** — failure handling
- **Expected result** — success definition

---

## 1. User Registration

- **Actor:** New user
- **Trigger:** User chooses "Create account" on web or Android
- **Preconditions:** Valid email; email not already registered; password meets policy (min 12 chars, mixed case + digit)
- **Main flow:**
  1. User submits email + password.
  2. Client validates format locally.
  3. `POST /auth/register` validates input server-side.
  4. Server creates user with hashed password (Argon2id), `status=pending`.
  5. Server generates email verification token (short-lived).
  6. Server sends verification email.
  7. User clicks verification link.
  8. `POST /auth/verify-email` confirms account; `status=active`.
  9. User proceeds to login or is auto-logged-in.
- **Alternative flow:** User registers from Android companion → same API; Android stores credentials securely in Android Keystore.
- **Failure cases:** Email already registered (409); invalid email (422); weak password (422); verification email delayed (resend with cooldown); expired token (resend).
- **Expected result:** Verified active user account. No raw password stored anywhere.

## 2. Login

- **Actor:** Registered user
- **Trigger:** User opens app and enters credentials (or taps biometric)
- **Preconditions:** Email verified; account active
- **Main flow:**
  1. User submits email + password.
  2. `POST /auth/login` validates credentials (Argon2id verify).
  3. Server returns `accessToken` (short-lived) + `refreshToken` (opaque, hashed at rest, rotated).
  4. Server registers/logs the device (`POST /devices`).
  5. Client stores tokens securely (web: httpOnly secure cookie or in-memory; Android: Keystore + EncryptedSharedPreferences).
  6. Client fetches sync baseline and renders dashboard.
- **Alternative flow:** Biometric login → Android decrypts locally stored refresh token via Keystore, silently refreshes access token.
- **Failure cases:** Wrong password (401 generic message); account locked after repeated failures; rate-limited (429); device revoked (401 with `device_revoked` code → re-login).
- **Expected result:** Valid session; user sees their data; device registered.

## 3. Logout

- **Actor:** Authenticated user
- **Trigger:** User taps "Log out"
- **Preconditions:** Valid session
- **Main flow:**
  1. Client calls `POST /auth/logout` with refresh token.
  2. Server revokes refresh token and current device session.
  3. Client wipes in-memory tokens and local encrypted app-lock secret (per policy).
  4. Client returns to login.
- **Alternative flow:** Logout from all devices → `POST /auth/logout-all` revokes all refresh tokens + device records.
- **Failure cases:** Network offline → local-only logout (tokens cleared locally, server revocation queued/retried); token already revoked (idempotent success).
- **Expected result:** Session terminated; tokens unusable.

## 4. Dashboard

- **Actor:** Authenticated user
- **Trigger:** User opens the app after login
- **Preconditions:** Valid session; sync complete (or last cached snapshot)
- **Main flow:**
  1. Client requests `GET /dashboard/summary`.
  2. Server computes balances, current-month income/expense, top categories, recent transactions, active budget status.
  3. Client renders summary + mini-charts + recent activity list.
  4. Client optionally fetches AI insight cards (`GET /ai/insights`).
- **Alternative flow:** Offline → render cached snapshot with "offline" indicator.
- **Failure cases:** API error → cached data + retry; account not found (401/403).
- **Expected result:** User sees at-a-glance financial health and quick actions.

## 5. Add Income

- **Actor:** Authenticated user
- **Trigger:** User taps "Add income"
- **Preconditions:** Session valid; at least one active income category exists
- **Main flow:**
  1. User fills amount, date, category, source (merchant/counterparty), optional payment method/account/note.
  2. Client validates; `POST /transactions` (or enqueues offline).
  3. Server validates, runs duplicate check, stores with `type=income`, `source=manual`, `status=confirmed`.
  4. Server returns canonical transaction.
  5. Dashboard/analytics update.
- **Alternative flow:** Quick-add from dashboard summary bar.
- **Failure cases:** Validation 422; duplicate detected (409 or warn-and-create with `duplicateOf` link); offline (queued).
- **Expected result:** Income recorded once; totals correct.

## 6. Add Expense

- **Actor:** Authenticated user
- **Trigger:** User taps "Add expense"
- **Preconditions:** Session valid; active expense category exists
- **Main flow:**
  1. User enters amount, date, category, merchant, optional payment method/account/note.
  2. Client validates; create via API or offline queue.
  3. Server validates, duplicate-check, stores `type=expense`.
  4. Budget/analytics recalculate.
- **Alternative flow:** Add via SMS-recommended draft; add via receipt OCR draft.
- **Failure cases:** 422 validation; duplicate; offline queue.
- **Expected result:** Expense recorded once; budget spent count updated.

## 7. Edit Transaction

- **Actor:** Authenticated user
- **Trigger:** User edits an existing transaction
- **Preconditions:** Transaction exists (not soft-deleted)
- **Main flow:**
  1. `PATCH /transactions/:id` with changed fields.
  2. Server validates; marks `edited=true`; re-runs duplicate check for amount/date/merchant changes.
  3. Derived aggregates (budgets, analytics) recompute.
  4. Audit log entry written.
- **Alternative flow:** Edit while offline → optimistic local edit + sync op `UPDATE`.
- **Failure cases:** 404 not found; 422; concurrent edit conflict (sync conflict resolution — see SYNC_ARCHITECTURE).
- **Expected result:** Transaction reflects edit; derived data consistent; audit trail records change.

## 8. Delete Transaction

- **Actor:** Authenticated user
- **Trigger:** User deletes a transaction
- **Preconditions:** Transaction exists
- **Main flow:**
  1. `DELETE /transactions/:id`.
  2. Server soft-deletes (`deletedAt`, `deletedBy`); kept for audit/sync tombstones.
  3. Derived aggregates recompute; audit log entry.
- **Alternative flow:** Offline delete → tombstone in sync queue.
- **Failure cases:** 404; delete already-deleted (idempotent).
- **Expected result:** Transaction no longer visible; history recoverable for a retention window.

## 9. Categorize Transaction

- **Actor:** Authenticated user (or automation)
- **Trigger:** Uncategorized transaction; user wants to re-categorize; rule/AI suggestion pending
- **Preconditions:** Transaction exists; target category exists for same type (income vs expense)
- **Main flow:**
  1. User opens transaction → assigns category.
  2. `PATCH /transactions/:id {categoryId}`.
  3. Server validates type-category compatibility; stores category; recomputes aggregates.
  4. Optionally user confirms AI suggestion (same write).
- **Alternative flow:** Rule-based auto-categorization applies `category=auto` with `categorizedBy=rule`; AI suggestion appears as pending for review.
- **Failure cases:** Type mismatch (422); category deleted (404).
- **Expected result:** Transaction categorized; breakdowns correct; automation recorded.

## 10. Create Budget

- **Actor:** Authenticated user
- **Trigger:** User taps "New budget"
- **Preconditions:** At least one expense category exists; no conflicting active budget for same category+period
- **Main flow:**
  1. User picks category, period, amount, optional rollover.
  2. `POST /budgets`.
  3. Server validates uniqueness (category+period+active).
  4. Budget appears in tracking view; alert hooks configured.
- **Failure cases:** Duplicate budget for category/period (409); amount ≤ 0 (422).
- **Expected result:** Budget active and tracked.

## 11. Track Budget

- **Actor:** Authenticated user
- **Trigger:** Viewing budgets or dashboard
- **Preconditions:** Budget exists
- **Main flow:**
  1. `GET /budgets?period=...`.
  2. Server returns allocated, spent (period-dated confirmed expenses), remaining, percent, status (`ok|warning|over`).
  3. Client renders progress bars; alerts if thresholds crossed.
- **Alternative flow:** Real-time update as transactions sync.
- **Failure cases:** None beyond session/errors (502 → retry).
- **Expected result:** User sees live budget health.

## 12. Create Savings Goal

- **Actor:** Authenticated user
- **Trigger:** User taps "New goal"
- **Preconditions:** User has a default income account/currency
- **Main flow:**
  1. User enters name, target amount, target date, optional monthly contribution.
  2. `POST /savings-goals`.
  3. Server stores goal; computes projected completion.
  4. Goal appears in dashboard/goals view.
- **Alternative flow:** Goal from AI suggestion (e.g., "based on your spending, you can save X/month").
- **Failure cases:** Invalid target (422).
- **Expected result:** Goal tracked with progress.

## 13. View Analytics

- **Actor:** Authenticated user
- **Trigger:** User opens Analytics
- **Preconditions:** Some confirmed transactions exist
- **Main flow:**
  1. `GET /analytics/summary?from=&to=&granularity=`.
  2. Server computes: cash flow, income vs expense, category breakdowns, trend deltas, top merchants, anomalies.
  3. Client renders charts + table insights.
- **Alternative flow:** Date-range/period presets; drill-down into category.
- **Failure cases:** Empty dataset (empty-state UI); huge range (server caps result, warns).
- **Expected result:** User understands where money went.

## 14. Search Transactions

- **Actor:** Authenticated user
- **Trigger:** User types in search box / opens filters
- **Preconditions:** Session valid
- **Main flow:**
  1. Client sends `GET /transactions?q=&filters...` (debounced).
  2. Server filters by text (merchant/category/note), date range, type, source, status, amount, payment method, tags.
  3. Server returns paginated results.
  4. Client renders results with match highlighting.
- **Alternative flow:** Offline search over local store.
- **Failure cases:** None material; empty results empty-state.
- **Expected result:** Precise, fast retrieval.

## 15. Import CSV/Excel

- **Actor:** Authenticated user
- **Trigger:** User uploads a bank/UPI/app export
- **Preconditions:** File valid (size ≤ limit, MIME + extension match); parseable
- **Main flow:**
  1. `POST /imports` (multipart).
  2. Server validates MIME/size; stores file securely; creates import job.
  3. Server parses, normalizes rows, runs duplicate checks against ledger + within file.
  4. Server returns preview (rows, confidence, dupes, errors).
  5. User maps columns (if needed) / confirms.
  6. `POST /imports/:id/commit` writes accepted rows as transactions (`source=import`, `importId`).
  7. User reviews rejected/skipped rows.
- **Alternative flow:** Automatic column mapping with user override.
- **Failure cases:** Unsupported format (415); size too large (413); malformed rows (reported per-row, not whole-file failure); duplicate file (409).
- **Expected result:** Verified import with no duplicates; audit trail links transactions to import.

## 16. Export CSV/Excel

- **Actor:** Authenticated user
- **Trigger:** User taps "Export"
- **Preconditions:** Filter set (or all)
- **Main flow:**
  1. `POST /exports` with filters/format → job created.
  2. Server generates file; `GET /exports/:id` polls; `GET /exports/:id/download` streams file.
  3. File expires (retention window) then is deleted.
- **Alternative flow:** Sync export job with email link (P2).
- **Failure cases:** Range too large (server paginates); job failure (reported).
- **Expected result:** Downloadable, clean, machine-readable export.

## 17. Generate Monthly PDF Report

- **Actor:** Authenticated user
- **Trigger:** User requests monthly report (dashboard or reports page)
- **Preconditions:** Data for period exists
- **Main flow:**
  1. `POST /reports/monthly {month, year}` → job.
  2. Server computes summary, category breakdowns, charts, top merchants, budget/scorecard.
  3. Server renders PDF (template), stores securely, returns download URL.
  4. `GET /reports/:id/download` streams PDF.
- **Alternative flow:** Scheduled auto-email (P2).
- **Failure cases:** No data (empty report with guidance); job failure (retry).
- **Expected result:** Professional, branded PDF summarizing the month.

## 18. Upload Receipt

- **Actor:** Authenticated user
- **Trigger:** User attaches receipt image to a transaction or starts from receipt
- **Preconditions:** Image valid (jpg/png/webp/heic, ≤ limit); session valid
- **Main flow:**
  1. `POST /receipts` (multipart).
  2. Server validates MIME/size; scans; stores encrypted; creates OCR job.
  3. Client shows processing state.
  4. OCR result returns for review (see OCR flow).
- **Alternative flow:** Receipt attached to existing transaction (metadata only).
- **Failure cases:** 415 invalid type; 413 too large; scan flagged (quarantine).
- **Expected result:** Receipt stored; OCR job queued; transaction linkage ready.

## 19. OCR Receipt Processing

- **Actor:** System (OCR pipeline) + user review
- **Trigger:** Receipt upload completes; OCR job starts
- **Preconditions:** Valid image stored
- **Main flow:**
  1. Job picks up image; OCR service extracts text/fields.
  2. Normalizer maps raw fields → transaction draft (merchant, amount, date, items, tax, total, payment method) with per-field confidence.
  3. Duplicate check against ledger.
  4. Draft surfaced to user with confidence indicators.
  5. User confirms/edits → transaction created (`source=ocr`, `receiptId`, `ocrConfidence`).
  6. Low-confidence fields highlighted; user must confirm.
- **Alternative flow:** High-confidence + user-enabled auto-commit → auto-create pending review (still reversible).
- **Failure cases:** OCR service down (retry); unreadable image (low confidence, no auto-create); fields missing (partial draft).
- **Expected result:** Transaction created only after confidence + review; no phantom transactions.

## 20. Automatic SMS Transaction Detection

- **Actor:** Android companion (background) → MoneyTalks backend
- **Trigger:** New bank/UPI SMS received (or backlog scan after permission)
- **Preconditions:** User granted SMS permission + explicit in-app consent; feature enabled
- **Main flow:**
  1. SMS receiver intercepts message.
  2. Parser (rule-based, multi-bank) extracts amount, type, merchant/counterparty, UPI ref, account ref, date/time, payment method, bank.
  3. Normalizer produces canonical draft.
  4. Classifier marks income/expense with confidence.
  5. Duplicate detector checks local + sync history (UPI ref, bank+amount+date, message hash).
  6. Draft stored locally (`source=sms`, `status=pending`).
  7. User reviews → confirms/rejects/edits.
  8. Confirmed → sync engine pushes to backend.
- **Alternative flow:** Auto-confirm setting for high-confidence familiar merchants.
- **Failure cases:** Unparseable SMS (silent skip + logging, never crash); OTP/promo messages (filtered); duplicate (deduped); permission revoked (feature pauses).
- **Expected result:** Transactions appear with evidence (raw message retained locally, refs synced) and zero duplicates.

## 21. Automatic Income Detection

- **Actor:** Android detection pipeline
- **Trigger:** SMS matches income pattern (e.g., "credited", "salary", "refund received")
- **Preconditions:** SMS permission + consent; parser supports the bank
- **Main flow:** same as #20 with `classification=income`; amount credited, `direction=inflow`.
- **Failure cases:** Ambiguous keyword (defaults to review, low confidence).
- **Expected result:** Income draft ready for one-tap confirmation.

## 22. Automatic Expense Detection

- **Actor:** Android detection pipeline
- **Trigger:** SMS matches debit/UPI-payment pattern
- **Preconditions:** Same as income
- **Main flow:** same as #20 with `classification=expense`.
- **Failure cases:** Mixed messages (e.g., "refund of payment") → review-first.
- **Expected result:** Expense draft with merchant + amount ready to confirm.

## 23. Duplicate Transaction Detection

- **Actor:** System (any ingestion path)
- **Trigger:** Transaction create/import/sync/SMS-confirm
- **Preconditions:** Canonical draft fields available
- **Main flow:**
  1. Ingestion computes duplicate fingerprint(s): external ref (UPI ref, bank ref), or `(user, date, amount, merchant, source)`.
  2. Lookup against ledger + pending drafts + incoming batch.
  3. If exact match → block (409, `duplicateOf`).
  4. If probable match → warn (user decides: skip, create anyway, link as duplicate).
- **Alternative flow:** OCR/SMS drafts match an existing transaction → marked "already exists".
- **Failure cases:** Fingerprint collisions (rare, low risk, documented); fuzzy near-duplicates (user review).
- **Expected result:** No silent duplicates across any path; deterministic behavior.

## 24. Transaction Review / Confirmation

- **Actor:** User
- **Trigger:** Pending auto-detected (SMS/OCR) or AI-suggested item appears in review queue
- **Preconditions:** Draft exists with evidence + confidence
- **Main flow:**
  1. User opens review queue.
  2. Client shows extracted fields, confidence, raw evidence (SMS text / receipt image).
  3. User confirms → status `confirmed`, `confirmedBy`, `confirmedAt`.
  4. User edits → corrected + `edited=true` (keeps original evidence).
  5. User rejects → `status=rejected` + optional reason.
- **Alternative flow:** Bulk-confirm group of same-merchant high-confidence items.
- **Failure cases:** None beyond data integrity guarantees.
- **Expected result:** Only user-approved transactions enter the canonical ledger.

## 25. Offline Transaction Creation

- **Actor:** User (offline client)
- **Trigger:** User creates transaction with no network
- **Preconditions:** Client has valid local session cache (refresh token or app-unlock); local store writable
- **Main flow:**
  1. Client generates `clientId` (UUID) for transaction.
  2. Client validates locally (shared Zod schemas).
  3. Client stores transaction in local store with `syncState=pending`, `clientId`, `updatedAt=local`.
  4. Sync queue appends `CREATE` op (idempotency key = `clientId`).
  5. UI shows "Pending sync" badge.
  6. On reconnect, sync flow runs (see Sync flow).
- **Alternative flow:** Edit/delete offline → `UPDATE`/`DELETE` ops in queue.
- **Failure cases:** Local quota (prompt cleanup); schema version drift (blocked until app update).
- **Expected result:** Transaction safely captured; will sync idempotently.

## 26. Sync After Reconnecting

- **Actor:** Client sync engine
- **Trigger:** Network restored (or app foreground / timer)
- **Preconditions:** Authenticated session; local queue non-empty or server cursor behind
- **Main flow:**
  1. Client acquires session; pulls server changes since `lastSyncCursor` (paged).
  2. Client applies server changes (non-conflicting) to local store.
  3. Client pushes local queue ops with idempotency keys; server responds per-op (`applied | duplicate | conflict | error`).
  4. Conflicts resolved per strategy (see SYNC_ARCHITECTURE) — default: server wins for canonical fields, client re-offers user resolution when needed.
  5. Client updates `lastSyncCursor`; clears applied ops; updates `syncState`.
  6. Server returns canonical entities; client merges (canonical `id`, `updatedAt` win).
- **Alternative flow:** Pagination (batch loop); large queue (chunked).
- **Failure cases:** Server down (retry exponential backoff); auth expiry (re-auth flow); schema conflict (version gate); op permanently failing (surface for user).
- **Expected result:** Convergence without duplicates or data loss.

## 27. Multi-Device Synchronization

- **Actor:** Device A (source of change) + Device B (consumer)
- **Trigger:** Any device writes; other devices sync
- **Preconditions:** Both devices authenticated to same user; internet available
- **Main flow:**
  1. Device A writes via API (canonical `updatedAt`/`rev` bumped).
  2. Device B sync pull sees new server state via cursor.
  3. Device B merges; conflict rules applied; UI updated.
- **Alternative flow:** Both offline and conflicting → last-write-wins on server timestamp after both push; user notified of resolution.
- **Failure cases:** Network partition (resolved on reconnect); duplicate ops (idempotent).
- **Expected result:** All devices converge to identical canonical state.

## 28. PIN Setup

- **Actor:** Mobile user (web users may opt into session lock)
- **Trigger:** User enables app lock
- **Preconditions:** Session valid; device supports local secure storage
- **Main flow:**
  1. User chooses PIN (min 4, configurable length).
  2. Client derives key from PIN (PBKDF2/Argon2 stretch) → protects a local secret (refresh token / local DB key).
  3. Only salted hash of PIN-derived key stored locally (for unlock verification); raw PIN never stored.
  4. App lock engages on background/timeout.
- **Alternative flow:** Biometric unlock as faster path.
- **Failure cases:** Wrong PIN (limited attempts + cooldown/wipe policy); forgot PIN → re-login resets local lock.
- **Expected result:** Local data protected; no raw PIN persisted; backend unaffected.

## 29. Biometric Authentication

- **Actor:** Mobile user
- **Trigger:** App lock engages; user opts for biometric unlock
- **Preconditions:** Device has biometric (fingerprint/face); user enrolled app in Keystore
- **Main flow:**
  1. User taps biometric; Android prompts system biometric.
  2. Keystore releases the PIN-derived secret key upon successful auth.
  3. Client uses secret to unlock local store / refresh session.
- **Alternative flow:** PIN fallback when biometric unavailable.
- **Failure cases:** Biometric failure (fallback to PIN); hardware unavailable (PIN only); enrollment revoked.
- **Expected result:** Convenient secure unlock. **Biometric data never leaves device/OS; never stored by app.**

## 30. Cloud Backup (Opt-In)

- **Actor:** Authenticated user
- **Trigger:** User enables cloud backup; periodic schedule
- **Preconditions:** Feature opt-in; encryption passphrase or user key; server-side encrypted vault
- **Main flow:**
  1. Client encrypts local data with user key.
  2. `POST /backups` uploads encrypted bundle (object storage + metadata record).
  3. Restore: user authenticates + provides key → downloads → decrypts → restores.
- **Alternative flow:** Server-side encrypted snapshot (key escrow) with user passphrase.
- **Failure cases:** Missing key on restore (data unrecoverable by design — documented); partial upload (retry); corrupt bundle (checksum fail).
- **Expected result:** Recoverable encrypted backup; privacy preserved even at rest.

## 31. AI Financial Assistant (Q&A)

- **Actor:** User
- **Trigger:** User asks a question ("Why did I spend more this month?")
- **Preconditions:** Session valid; AI feature enabled; sufficient data
- **Main flow:**
  1. `POST /ai/chat` with question.
  2. Server runs intent detection → selects financial query (not raw DB).
  3. Analytics layer computes structured answer data (bounded, aggregated).
  4. AI model receives context + computed data → grounded response with citations to categories/periods.
  5. Response returned; client renders; user can drill into underlying transactions.
- **Alternative flow:** Streaming; follow-up questions (conversation context kept bounded).
- **Failure cases:** Ambiguous intent (clarifying question); no data (honest "not enough data"); provider outage (fallback: computed-data-only answer without generative text).
- **Expected result:** Accurate, grounded, traceable answer. AI cannot invent figures or modify data.

## 32. AI-Generated Financial Insights

- **Actor:** Backend insight service
- **Trigger:** Scheduled/recompute after ledger changes; user opens Insights
- **Preconditions:** Sufficient data volume; feature enabled
- **Main flow:**
  1. Analytics computes candidate signals (anomaly, trend, budget risk).
  2. AI service drafts insight text from the structured signals (grounded).
  3. Insight stored (`ai_insights`) with `dataSnapshot`/references; shown on dashboard.
  4. User can dismiss/like to train quality.
- **Alternative flow:** Manual refresh.
- **Failure cases:** Provider down → queue/recompute; low data → fewer insights.
- **Expected result:** Timely, grounded, actionable insights tied to real numbers.

---

## Flow-to-Document Index

| Concern | Reference document |
|---|---|
| Sync / conflict / idempotency internals | `SYNC_ARCHITECTURE.md` |
| SMS parsing internals | `SMS_TRANSACTION_ARCHITECTURE.md` |
| OCR internals & confidence | `OCR_ARCHITECTURE.md` |
| AI grounding & safety | `AI_ARCHITECTURE.md` |
| Security / tokens / devices | `SECURITY_ARCHITECTURE.md` |
| File storage & retention | `DOCUMENT_ARCHITECTURE.md` |
| Error semantics | `ERROR_HANDLING.md` |
