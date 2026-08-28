# MoneyTalks — Error Handling Strategy (Phase 1)

> Status: Approved (design only). Defines a consistent error contract across Web, Android, API, DB, OCR, AI, Sync, and file processing.

---

## 1. Principles

1. **One error contract** everywhere (API-centric; clients render from it).
2. **Categorized, actionable errors** — the client can branch on `code`.
3. **User-facing vs developer-facing split:** safe, plain-language messages to users; detailed `details`/traces only in developer contexts (non-prod or gated).
4. **Never leak internals:** no stack traces, SQL, Mongo errors, or secrets to clients.
5. **Idempotent and retry-friendly:** transient errors are clearly marked (`retryable: true`) with backoff hints.
6. **Correlation:** every error carries `requestId`; logs tie server events to client reports.

---

## 2. Error Contract (API)

Response shape (non-2xx):

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable, actionable message",
    "details": [ { "field": "amountMinor", "issue": "Must be a positive integer", "code": "POSITIVE_REQUIRED" } ],
    "retryable": false,
    "retryAfterSeconds": null,
    "requestId": "req_abc123"
  }
}
```

## 3. Error Categories & HTTP Mapping

| Category | HTTP | `code` (examples) | Retryable | Notes |
|---|---|---|---|---|
| Validation | 422 | `VALIDATION_ERROR` | No | Zod details per field |
| Authentication | 401 | `UNAUTHORIZED`, `TOKEN_EXPIRED`, `TOKEN_REVOKED`, `DEVICE_REVOKED`, `REFRESH_REUSE` | No | Generic message; `REFRESH_REUSE` triggers re-login |
| Authorization | 403 | `FORBIDDEN`, `FEATURE_DISABLED` | No | Ownership or feature gate |
| Not found | 404 | `NOT_FOUND` | No | Never reveals existence of others' data |
| Conflict / duplicate | 409 | `DUPLICATE_TRANSACTION`, `BUDGET_EXISTS`, `RESOURCE_CONFLICT`, `IMPORT_ALREADY_COMMITTED` | No | `duplicateOf` id in details |
| Rate limit | 429 | `RATE_LIMITED`, `QUOTA_EXCEEDED` | Yes (respect `retryAfterSeconds`) | `Retry-After` header |
| Payload too large | 413 | `PAYLOAD_TOO_LARGE` | No | With max limit |
| Unsupported media | 415 | `UNSUPPORTED_MEDIA_TYPE` | No | MIME/format |
| Gone / expired | 410 | `RESOURCE_EXPIRED` | No | Downloads expired |
| Upstream failure (transient) | 502 | `UPSTREAM_UNAVAILABLE` | Yes | OCR/AI/email/storage adapter down |
| Timeout | 504 | `TIMEOUT` | Yes | Gateway/upstream timeout |
| Sync-level | 409/422 | `SYNC_CONFLICT`, `SYNC_SCHEMA_MISMATCH`, `SYNC_REJECTED` | Mixed | Per-op results in push response |
| Async job failed | 200 job status | `JOB_FAILED` + `error.code` | User retry | Job result carries error |
| Unknown/internal | 500 | `INTERNAL_ERROR` | Yes (transient) | No internals leaked; `requestId` |

## 4. Error Handling by Layer

### 4.1 Web
- **API client** (packages/clients): unwraps envelope, throws typed `ApiError` (code, status, details).
- **TanStack Query:** maps ApiError → toast/inline error; `retryable` errors retried with backoff; 401 → single-flight token refresh → on failure redirect to login.
- **Form validation:** Zod client-side mirrors server → instant field errors; server 422 merges into the same form state.
- **Async jobs** (import/export/report/OCR): status polled; `JOB_FAILED` shows the job's error + retry action.
- **Offline:** network errors intercepted → offline banner; queued ops show sync states; permanent sync failures surface in review queue.
- **Fatal:** top-level error boundary → branded, restorable screen + report button (logs requestId).

### 4.2 Android
- Same typed error mapping (Retrofit converter → sealed class `ApiError`).
- WorkManager workers: transient failures → backoff + retry; permanent → mark op failed + user-visible badge.
- SMS pipeline: per-message try/catch; unparseable → skip silently, local telemetry (opt-in); never crash receiver.
- App lock/Keystore failures: fallback to PIN; "key invalidated" → re-auth flow.
- Offline: local write always succeeds (queue); sync errors surfaced in UI.

### 4.3 API (backend)
- **Middleware error handler** is the single place that renders the envelope; unknown errors → 500 with sanitized message + `requestId` logged with full context.
- Services throw typed domain errors (`DomainError(code, message, details, retryable)`) — no HTTP concerns in services.
- **Express async wrapper** catches rejections → central handler (no unhandled promises).
- **Unhandled rejection/exception hooks:** log + alert; process keeps serving (worker restarts on crash via orchestrator).
- Request aborted mid-stream: no response expected; op not committed unless already idempotent-applied (client retries).

### 4.4 Database
- **Connection/transient:** retry with backoff; circuit breaker on Mongo client; 502 upstream if persistently down.
- **Unique index violation (E11000):** translate to `DUPLICATE_*` (fingerprint/clientId) → surfaced as 409; never a 500.
- **Cast/validation errors:** translate to 422 with field detail.
- **Timeout:** 504 with `retryable=true`.
- Migrations: run additive; failure → blocked deploys, no partial schema.

### 4.5 OCR
- Provider down → job retried (exponential backoff) → DLQ after N; job status `failed`, error `UPSTREAM_UNAVAILABLE`.
- Unreadable image → low confidence (not an error); draft requires review (never auto-commit).
- Malformed/oversized/quarantined → per-file 413/415/quarantine with clear message.

### 4.6 AI
- Provider down → fallback provider → else computed-data-only answer (grounded template) — never error to user when data exists.
- Ambiguous intent → clarify response (not an error).
- No data → "not enough data" honest answer.
- Abuse/rate → `RATE_LIMITED` / `QUOTA_EXCEEDED` (per-user AI caps).

### 4.7 Sync
- **Per-op results** (`applied | duplicate | conflict | rejected`) — not exceptions; client handles each.
- Transient failures → backoff retry; permanent → op `failed` + user-visible.
- Conflict → client shows resolution UI (SYNC_ARCHITECTURE §3.7).
- Schema mismatch → block sync, prompt app update (`SYNC_SCHEMA_MISMATCH`).

### 4.8 File processing
- Upload validation (413/415/422), magic-byte failures, AV quarantine, partial import row errors (row-level report), expired downloads (410).

---

## 5. Error Message Authoring (UX)

- **User-facing:** state what happened, what it means, and the next action. Plain language. No jargon/codes (codes shown only in expandable "details" or support export).
- Examples:
  - 401 login: "Your session has ended. Please sign in again."
  - 409 duplicate: "This looks like a transaction you already have. View it instead of adding a duplicate."
  - OCR low confidence: "We couldn't read this receipt well enough to add it automatically. Please confirm the details."
  - Sync failed: "3 changes couldn't sync. Tap to review."
- **Developer-facing:** `details`, stack (non-prod only), `requestId`, correlated logs.

## 6. Logging & Correlation

- Every request logs start/finish with `requestId`, status, latency, and (sanitized) outcome.
- Errors log `error`, `domain`, `retryable`, `requestId`; **never** log tokens, passwords, raw SMS, or PII.
- Client error reports carry `requestId` for support triage.

## 7. Testing Error Paths

- Integration tests per category (each mapped code).
- Chaos tests: DB down, queue down, provider down, network partitions (staging).
- Client tests: 401 refresh flow, offline queue, conflict UI, job failure retry.

## 8. Related Documents

- Security: `SECURITY_ARCHITECTURE.md`
- Sync: `SYNC_ARCHITECTURE.md`
- Observability/logging: `OBSERVABILITY.md`
