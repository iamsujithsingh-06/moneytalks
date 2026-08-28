# MoneyTalks — Database Architecture (Phase 1)

> Status: Approved (architectural level — no code). Design authority: `adr/ADR-002-database.md`.

---

## 1. Design Principles

1. **Single system of record:** MongoDB Atlas. Every canonical entity lives here.
2. **Ownership/isolation first:** every user-owned document carries `userId`; all queries are scoped by userId (authz enforced in the service layer, never by client input).
3. **Validation is mandatory:** Zod schemas (shared package) are the source of truth for write shape; Mongoose schemas mirror them. The DB must never accept invalid writes.
4. **Soft-delete + tombstones:** user-facing deletes are soft (`deletedAt`/`deletedBy`) with a retention window so sync tombstones and audit survive.
5. **Indexes for hot paths:** read/write patterns drive indexes; analytics read paths are aggregated server-side.
6. **Timestamps everywhere:** `createdAt`/`updatedAt` on all documents; `rev`/`updatedAt` drives sync conflict resolution.
7. **Never store secrets:** no raw passwords (only Argon2id hashes), no refresh tokens in plaintext (hashed), no biometric data (never stored).
8. **PII minimization:** raw SMS text is local-only by default; server stores extracted, non-sensitive structured fields.

---

## 2. Conventions

- Collection names: snake_case plural (matches entity table below).
- `_id`: MongoDB ObjectId (server) or explicit string for sync entities.
- Every user-owned doc:
  - `userId: ObjectId` — owner.
  - `clientId: string` — client-generated UUID for offline-first ops (unique per user per entity type where applicable).
  - `createdAt`, `updatedAt` (indexed for sync cursor).
  - `rev: number` — incremented on each server write (sync conflict resolution).
  - `deletedAt?: Date`, `deletedBy?: ObjectId` — soft-delete.
- Money: integer **minor units** (paise/cents) to avoid float issues + `currency: string` (ISO 4217). Field naming: `amountMinor`, `currency`.
- IDs in APIs are opaque strings; clients never interpret structure.

---

## 3. Entity Catalog

### 3.1 `users`
- **Purpose:** account, auth, profile, app settings.
- **Fields:**
  - `email: string` — **unique, indexed** (case-insensitive).
  - `passwordHash: string` — Argon2id hash (never raw).
  - `name: string`.
  - `emailVerifiedAt?: Date`, `emailVerification` (token hash + expires).
  - `passwordReset` (token hash + expires).
  - `status: 'pending' | 'active' | 'disabled'`.
  - `defaultCurrency: string` (ISO 4217, default `INR`; reserved for multi-currency).
  - `defaultPaymentMethodId?`, `defaultAccountRef?`.
  - `preferences`: theme (`dark` default), locale, notification prefs.
  - `security`: `loginAttempts`, `lockedUntil?`, `twoFactorEnabled` (future).
  - `aiFeaturesEnabled: boolean` (opt-in).
  - `audit` fields + soft-delete.
- **Indexes:** `email` unique; `status`.
- **Constraints:** one account per email; email verified before active use of paid features (free tier: active after verification).
- **Relationships:** 1:N to all user-owned collections.

### 3.2 `categories`
- **Purpose:** categorization taxonomy (income + expense + transfer).
- **Fields:** `userId`, `name`, `type: 'income' | 'expense' | 'transfer'`, `parentId?` (hierarchy, P2), `icon`, `color`, `isDefault` (seeded per user), `order`, `deletedAt?`.
- **Indexes:** `{userId, type}`, unique `{userId, name}`.
- **Relationships:** referenced by transactions, budgets, import mappings.
- **Seeding:** on user creation, seed default income/expense categories.

### 3.3 `transactions` — the core ledger document
- **Purpose:** unified ledger for all 5 types and 4 sources with full provenance, confidence, status, and duplicate support.

**Type** (`type`):
- `income` | `expense` | `refund` | `transfer` | `adjustment`

**Source** (`source`):
- `manual` | `sms` | `import` | `ocr`

**Status** (`status`):
- `pending` (auto-detected, awaiting review) | `confirmed` (user-approved/canonical) | `rejected`

**Fields:**
- Core: `userId`, `clientId` (unique per user), `type`, `source`, `status`.
- Money: `amountMinor: number`, `currency: string`.
- Direction: `direction: 'inflow' | 'outflow'` (derived from type; refund of expense = inflow; stored for query speed).
- Time: `transactionDate: Date` (business date), `createdAt`, `updatedAt`.
- Classification: `categoryId?`, `categorizedBy: 'manual' | 'rule' | 'ai' | 'default' | null`, `categoryConfidence?`.
- Counterparty/merchant: `merchant?`, `counterparty?` (payee/payer), `note?`, `tags: []`.
- Payment context: `paymentMethodId?` (ref → payment_methods), `accountRef?` (masked account/card ref string), `bankSource?`.
- Provenance & confidence:
  - `smsRef?` (structure `{senderHash, receivedAt, messageHash, upiRef?, bankRef?}` — raw text NOT stored server-side).
  - `importRef?` (ref → imports, `{importId, rowIndex, originalAmount?, originalDate?}`).
  - `ocrRef?` (ref → receipts, `{receiptId, fieldConfidence: {...}, totalConfidence}`).
  - `confidence: number` (0–1 overall), `confidenceDetail?` (per-field).
- Automation flags: `autoDetected: boolean`, `detectedAt?`.
- Review: `confirmedBy?`, `confirmedAt?`, `rejectedAt?`, `rejectedReason?`.
- Edits: `editedAt?`, `editedBy?`, `editedCount`.
- Duplicate handling: `duplicateOf?` (ObjectId, when linked as duplicate), `duplicateGroup?` (string).
- Soft-delete + sync: `deletedAt?`, `deletedBy?`, `rev`, `createdAt`, `updatedAt`.

**Important indexes:**
- `{userId, transactionDate: -1}` — ledger/analytics default.
- `{userId, status, transactionDate: -1}` — review queue.
- `{userId, categoryId, transactionDate: -1}` — category analytics.
- `{userId, source}` — source analytics.
- Unique: `{userId, clientId}` — idempotency for offline push.
- Duplicate fingerprint index: `{userId, fingerprint}` unique (see 3.14 & §6).
- Text index for search: `{userId, merchant: 'text', note: 'text', counterparty: 'text'}` (or Atlas Search — decided at implementation).

**Relationships:** category, payment_methods, receipts (ocr), imports, transactions (duplicateOf/transferTo).

**Ownership:** strict per-user isolation; queries always scoped by userId.

### 3.4 `payment_methods`
- **Purpose:** reusable payment context (UPI id, card last4, bank account mask, wallet).
- **Fields:** `userId`, `name` (e.g., "HDFC Savings"), `kind: 'upi'|'card'|'bank'|'wallet'|'cash'|'other'`, `refMask` (e.g., `*1234`, `***@okhdfcbank`), `icon?`, `deletedAt?`.
- **Indexes:** `{userId}`, unique `{userId, name}`.
- **Relationships:** referenced by transactions, recurring templates.

### 3.5 `budgets`
- **Purpose:** spending control per category over a period.
- **Fields:** `userId`, `categoryId` (or `scope: 'category'|'overall'`), `period: 'weekly'|'monthly'|'yearly'|'custom'`, `periodAnchor` (custom start), `allocatedMinor`, `currency`, `rollover: boolean`, `status: 'active'|'paused'|'completed'`, `alertThresholds` (`{warningPct, hardPct}`), `deletedAt?`.
- **Indexes:** unique `{userId, categoryId, period, status:'active'}` where applicable (partial unique index on active budgets); `{userId}`.
- **Relationships:** category; transactions compute spend.

### 3.6 `savings_goals`
- **Purpose:** target-based savings tracking.
- **Fields:** `userId`, `name`, `targetMinor`, `currency`, `targetDate?`, `currentMinor` (derived from allocations), `startDate`, `status: 'active'|'completed'|'paused'|'archived'`, `monthlyContribution?` (suggestion), `deletedAt?`.
- **Indexes:** `{userId, status}`.
- **Relationships:** optional linked `fundingAccountRef`; allocations are transactions or a `goal_allocations` sub-collection (decided at implementation; simple: transactions with `goalId` tag).

### 3.7 `recurring_transactions`
- **Purpose:** templates + detected patterns.
- **Fields:** `userId`, `name`, `type`, `amountMinor`, `currency`, `categoryId?`, `frequency: 'daily'|'weekly'|'monthly'|'yearly'|'custom'`, `interval`, `nextDueAt`, `startDate`, `endDate?`, `paymentMethodId?`, `merchant?`, `status: 'active'|'paused'|'cancelled'`, `detectedFrom?: ObjectId[]` (sample transactions), `lastGeneratedAt?`, `deletedAt?`.
- **Indexes:** `{userId, status}`, `{userId, nextDueAt}`.
- **Relationships:** transactions (generated instances link `recurrenceId`).

### 3.8 `receipts`
- **Purpose:** receipt image + OCR provenance.
- **Fields:** `userId`, `objectKey` (private object storage key — not public URL), `contentType`, `sizeBytes`, `sha256`, `status: 'uploaded'|'processing'|'ready'|'failed'|'reviewed'`, `ocrProvider`, `ocrJobId?`, `ocrResult?` (extracted fields + per-field confidence), `linkedTransactionId?`, `createdAt`, `deletedAt?`.
- **Indexes:** `{userId, status}`, `{userId, linkedTransactionId}`.
- **Relationships:** 1:1 with a created transaction (optional); image bytes live in object storage; metadata + OCR result here.

### 3.9 `devices`
- **Purpose:** session/device management + multi-device authz.
- **Fields:** `userId`, `deviceName`, `platform: 'web'|'android'`, `deviceFingerprint` (hashed, opaque), `refreshTokenHash` (opaque), `refreshTokenFamily` (for rotation/replay detection), `lastSeenAt`, `revokedAt?`, `createdAt`.
- **Indexes:** `{userId}`, unique `{refreshTokenHash}`.
- **Relationships:** user; revoked on logout/device revoke/logout-all.

### 3.10 `sync_records`
- **Purpose:** per-user, per-device sync cursor + state.
- **Fields:** `userId`, `deviceId`, `entity` (`transactions`, `categories`, etc.), `lastCursor` (updatedAt timestamp of last processed change), `lastSyncAt`, `opsProcessed`, `state: 'idle'|'syncing'|'error'`.
- **Indexes:** unique `{userId, deviceId, entity}`.
- **Relationships:** device, user.
- **Note:** cursors can also live in Redis (fast) with Mongo as durable fallback; canonical sync state here.

### 3.11 `notifications`
- **Purpose:** in-app + push notification log.
- **Fields:** `userId`, `type` (`budget_warning`, `budget_over`, `import_done`, `sync_error`, `ai_insight`, `system`), `title`, `body`, `data` (JSON, references), `readAt?`, `deliveredAt?`, `createdAt`, `deletedAt?`.
- **Indexes:** `{userId, readAt, createdAt}`.
- **Relationships:** user.

### 3.12 `ai_insights`
- **Purpose:** grounded AI insight records (retrievable history, dismissible).
- **Fields:** `userId`, `kind` (`anomaly`, `trend`, `budget_risk`, `savings_opportunity`, `summary`), `title`, `body`, `dataRefs` (aggregation refs: categoryIds, periods, amounts — NOT raw transactions), `dataSnapshot` (the structured numbers used to generate), `modelUsed`, `createdAt`, `dismissedAt?`, `feedback?`.
- **Indexes:** `{userId, createdAt}`.
- **Relationships:** user; links to analytics results only.

### 3.13 `imports` / `exports` / `reports` / `backups`
- **Purpose:** async document jobs.
- `imports`: `userId`, `fileName`, `mimeType`, `sizeBytes`, `sha256`, `status` (`uploaded|parsing|ready|committed|failed`), `columns`, `rowStats` (`{total, matched, duplicates, errors}`), `objectKey?`, `errorReport`, `createdAt`, `deletedAt?`.
- `exports`: `userId`, `format` (`csv|xlsx`), `filters` (serialized query), `status` (`queued|processing|ready|expired|failed`), `objectKey`, `expiresAt`, `downloadCount`.
- `reports`: `userId`, `period` (`{month, year}`), `type: 'monthly'`, `status`, `objectKey`, `expiresAt`, `generatedAt`.
- `backups`: `userId`, `status`, `objectKey`, `sha256`, `sizeBytes`, `createdAt`, `retentionUntil`.
- **Indexes:** `{userId, status, createdAt}` each.

### 3.14 `audit_logs`
- **Purpose:** security/accountability trail (immutable-ish).
- **Fields:** `userId?`, `actor` (`userId`, `system`, `deviceId`), `action` (e.g., `txn.create`, `txn.delete`, `auth.login`, `device.revoke`, `import.commit`), `targetType`, `targetId`, `before?`, `after?`, `ip?`, `userAgent?`, `requestId`, `createdAt`.
- **Indexes:** `{userId, createdAt}`, `{action, createdAt}`.
- **Retention:** e.g., 90 days online + archive. Write-only via service layer.

### 3.15 `duplicate_fingerprints` (support collection)
- **Purpose:** enforce duplicate prevention at the DB level (belt & braces over app-level checks).
- **Fields:** `userId`, `entity` (`transaction`), `fingerprint` (canonical string), `documentId`, `active: boolean` (tombstone on delete), `createdAt`.
- **Indexes:** unique `{userId, entity, fingerprint}`.
- **Relationship:** linked document.

### 3.16 `jobs`
- **Purpose:** async job status (import/export/report/OCR/AI) visible to users.
- **Fields:** `userId?`, `kind`, `status` (`queued|running|succeeded|failed`), `queueJobId`, `error?`, `resultRef?`, `createdAt`, `finishedAt`.
- **Indexes:** `{userId, kind, createdAt}`, `{status}` (worker scanning).

### 3.17 `app_settings` / `feature_flags`
- **Purpose:** server-side config (features, limits, provider selection, model config).
- Fields: `key`, `value` (JSON), `updatedAt`.
- **Indexes:** unique `key`.
- Used by service layer (provider selection, limits). No user data.

---

## 4. Ownership & User Isolation

- **Rule:** every user-owned collection has `userId`; every query in the service layer requires it; repository methods take `userId` and refuse queries without it.
- **Unique indexes are user-scoped** (e.g., `{userId, clientId}`, `{userId, name}`) so one user's data never collides with another's.
- **No cross-user reads.** Authorization is checked in the service layer; repository enforces scoping as defense-in-depth.

## 5. Relationships Summary

```
users 1─N transactions, categories, budgets, savings_goals, recurring_transactions,
      receipts, devices, sync_records, notifications, ai_insights, imports, exports,
      reports, backups, audit_logs
transactions N─1 categories, N─1 payment_methods, N─1 receipts (ocr), N─1 imports,
      N─1 recurring_transactions, 1─1 duplicateOf
budgets N─1 categories
recurring_transactions N─1 categories, N─1 payment_methods
receipts 1─0..1 transactions
```

## 6. Duplicate Detection (DB layer)

1. App computes **fingerprint(s)** for a candidate transaction (canonical, deterministic, versioned):
   - **Exact:** external refs (`upiRef`, `bankRef`, `importRef{rowIndex}`) if present.
   - **Probabilistic/fuzzy:** normalized `(date, amountMinor, currency, merchant, source)`.
   - **OCR/SMS:** message hash / receipt hash match.
2. Insert into `duplicate_fingerprints` inside the same transaction as the document write; unique index prevents races across replicas.
3. On conflict (`E11000`), the write is aborted and surfaced as a duplicate (`duplicateOf`), or routed to a **warn** path for fuzzy matches (user decides).
4. Fingerprint version prefix (`fp:v1:`) allows strategy evolution without breaking historical rows.
5. **Soft-delete semantics:** deactivating a fingerprint (op `active=false`) on hard purge only; soft-deleted transactions keep their fingerprint active to prevent re-insertion during the retention window.

## 7. Sync Support (DB layer)

- Every mutable entity carries `updatedAt` (server clock) + `rev`; sync pull = `GET ?since=updatedAt` with compound index `{userId, updatedAt}`.
- `clientId` unique indexes give idempotent push (upsert by clientId → returns existing).
- Tombstones: soft-deleted docs remain until `deletedAt + retention` (configurable), then are hard-purged by a cleanup job; sync clients must not re-create.
- Per-entity cursors stored in `sync_records`; short-lived cursors cached in Redis.

## 8. Analytics Support

- Real-time reads via aggregation pipelines over indexed `transactions` (date/category/source).
- For heavy dashboards, maintain **derived aggregates** (e.g., `analytics_daily` buckets per user/day: inflow, outflow, per-category totals) recomputed via queued jobs on writes (eventual within seconds). Decision gate at Phase 4 implementation based on measured latency.
- All aggregations filter `deletedAt: null`, `status: 'confirmed'` (+ optionally `pending` for drafts).

## 9. Indexes & Performance Notes

- Hot compound indexes listed per entity above.
- Text search: Atlas Search (Lucene) recommended for full-text over MongoDB text index (better stemming/relevance) — decided at implementation.
- Writes are idempotent-friendly; reads are query-scoped by userId to keep working sets small.
- Archive/retention jobs (hard-purge soft-deleted + expired docs) run on schedule; storage cost capped by retention policy (see `DOCUMENT_ARCHITECTURE.md` and `OBSERVABILITY.md`).

## 10. Migration & Evolution

- Schema changes are additive-first; breaking changes gated by a `schemaVersion` on documents and a `data/schemaVersion` client gate in sync.
- Migration scripts live in the repo, versioned, run via CI/manual operator; no destructive migrations without backup.
- Zod schemas in `packages/validation` are the single source of truth; generated DTOs shared with clients.

## 11. Open Items (tracked for Phase 2)

- Atlas Search vs text index for search (implementation decision).
- Analytics aggregate buckets vs pure aggregation pipelines (Phase 4 measurement gate).
- SQLCipher/Room encryption key management specifics (Android local DB) — architecture in `SECURITY_ARCHITECTURE.md`.
- Multi-currency support scope (reserved field, single-currency v1).
