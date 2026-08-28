# MoneyTalks — System Architecture (Phase 1)

> Status: Approved. This document defines the high-level component architecture and the communication between every component.

---

## 1. Architectural Overview

MoneyTalks is a **monorepo** containing three deployable surfaces (`web`, `api`, `android`) plus shared packages. The backend is a **stateless REST API** designed to scale horizontally. The Android companion is an **offline-first local-first** app that parses SMS locally and syncs to the backend. MongoDB Atlas is the single system of record. External providers (OCR, AI, object storage, email, PDF) are isolated behind internal service adapters so no vendor lock-in occurs.

```
                        ┌────────────────────────────┐
                        │         WEB CLIENT         │
                        │  React + Vite + TS + TW    │
                        │  Responsive SPA             │
                        └──────────────┬─────────────┘
                                       │ HTTPS / REST + WebSocket(optional, future)
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        │                         ┌────▼────────────────────────────┐ │
        │                         │        BACKEND (API)            │ │
        │                         │   Node.js + Express + TS        │ │
        │                         │   (stateless, horizontally      │ │
        │                         │    scalable replicas)           │ │
        │                         │                                 │ │
        │                         │  auth │ transactions │ analytics│ │
        │                         │  budgets │ goals │ import/export│ │
        │                         │  reports │ receipts │ sync │ AI │ │
        │                         └──────┬──────────────────────────┘ │
        │                                │                            │
        │   ┌──────────────┬─────────────┼─────────────┬─────────────┐│
        │   ▼              ▼             ▼             ▼             ▼│
        │ [MongoDB Atlas]  [Object     ] [OCR        ] [AI         ] │
        │ [  primary       storage     ] [ provider   ] [ provider  ]│
        │ [  datastore     (encrypted  ] [ adapter    ] [ adapter   ]│
        │ [  + Redis cache]  files)    ] [            ] [            ]│
        └────────────────────────────────────────────────────────────┘
                                      │
                         ┌────────────▼────────────┐
                         │  EMAIL / NOTIFICATION   │
                         │  provider (transactional│
                         │  mail, push if needed)  │
                         └─────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                  ANDROID COMPANION (offline-first)                  │
│  Kotlin + Jetpack                                                  │
│  SMS Receiver → Parser → Normalizer → Classifier → DuplicateCheck   │
│  Local DB (Room) + Sync Queue → Sync Engine ──► API                │
│  Secure storage (Android Keystore + EncryptedSharedPreferences)     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Component Catalog

### 2.1 Web Client (`apps/web`)
- React SPA built with Vite, TypeScript, Tailwind CSS.
- Responsibilities: dashboard, analytics, budgets, goals, import/export, reports, receipt upload, AI assistant UI, settings, auth.
- Offline-tolerant: caches last snapshot; full offline editing is primarily an Android capability, but the web client shares the same data layer patterns for future PWA offline.
- Consumes REST API via typed client generated from shared contracts.

### 2.2 Android Companion (`apps/android`)
- Native Kotlin app (Jetpack Compose, Room, WorkManager, Android Keystore).
- Responsibilities:
  - SMS/notification-based transaction detection (rule-based parser, multi-bank).
  - Local transaction drafts + confirmed transactions (offline-first).
  - PIN + biometric app lock.
  - Sync engine (queue, idempotency, conflict resolution).
  - Quick add, review queue, receipts capture.
- Communicates with API via the same REST sync protocol as web.

### 2.3 Backend API (`apps/api`)
- Node.js + Express + TypeScript, modular monolith (vertical slices) initially; designed so slices can be extracted to services if scale demands.
- Auth, user management, transactions, categories, budgets, savings goals, analytics, dashboard, recurring, import/export, reports, receipts/OCR orchestration, devices, sync, notifications, AI orchestration, settings, security.
- All data writes funnel through service layer + validation (Zod) + audit log.

### 2.4 Database — MongoDB Atlas
- Single system of record.
- Mongoose ODM with shared schemas in `packages/types`.
- Hot-path indexes; read-heavy analytics use aggregation pipelines; heavy analytics can be offloaded later to a derived/aggregate collection or read replica.

### 2.5 Cache / Queue (supporting infra)
- Redis (managed) for: rate limiting, refresh-token revocation list, sync cursors caching, job queue broker (or dedicated job queue — see below).
- Job processing: BullMQ/Redis or cloud queue for async jobs (import parsing, export generation, PDF rendering, OCR orchestration, AI insight recompute). Design is queue-agnostic.

### 2.6 Object Storage (cloud file/object storage if required → required for receipts/PDFs/exports/backups)
- Encrypted at rest, private-by-default, short-lived signed URLs for download, lifecycle policies for retention.

### 2.7 OCR Provider (external, adapter-isolated)
- Receipt OCR. Provider-independent adapter: `OCRProvider` interface. Reference: cloud OCR (e.g., Google Cloud Vision Document AI / AWS Textract / Azure Document Intelligence); vendor chosen at implementation time; architecture does not couple.

### 2.8 AI Provider (external, adapter-isolated)
- LLM for assistant + insights. Provider-independent: `AIProvider` interface (OpenAI/Anthropic/Gemini/self-hosted). Server-side, API keys never on clients.

### 2.9 PDF Generation
- Server-side templated PDF rendering service (e.g., headless render of a report template or PDF lib). Output stored in object storage.

### 2.10 Email / Notifications
- Transactional email provider (verification, password reset). Push notifications (optional, P2) via FCM for Android alerts.

---

## 3. Communication Between Components

| From → To | Protocol | Notes |
|---|---|---|
| Web ↔ API | HTTPS + REST JSON | JWT access token in secure httpOnly cookie (or Authorization header per deploy config); typed contracts |
| Android ↔ API | HTTPS + REST JSON | Sync protocol: pull cursor + push idempotent ops; batch endpoint `POST /sync/push` and `GET /sync/changes` |
| API ↔ MongoDB Atlas | MongoDB wire protocol (TLS) | Mongoose ODM; Atlas credentials from secrets manager |
| API ↔ Redis | Redis protocol (TLS) | Rate limit, revocation list, cursors, job broker |
| API ↔ Object storage | Provider SDK (HTTPS) | Signed upload/download; server-side encryption |
| API ↔ OCR provider | HTTPS (provider SDK) | Adapter isolates SDK; job-based (async) with webhook/poll result |
| API ↔ AI provider | HTTPS (provider SDK) | Adapter isolates SDK; grounded prompt assembly in service layer |
| API ↔ Email | HTTPS (provider SDK) | Transactional mail |
| Job worker ↔ everything | As above | Workers consume queue; share service layer code |
| Android ↔ SMS content provider / system broadcasts | Android framework | SMS receive permission; local only |
| Android ↔ local Room/Keystore | local | No network |

### Communication principles
- **All external calls async where possible.** OCR, AI, import, export, report, email are job-based with status endpoints (`GET /jobs/:id` pattern or per-resource status fields).
- **No direct DB access from clients.** API is the only gateway.
- **Adapters everywhere.** OCR/AI/Email/ObjectStorage are interface-sealed so providers swap without ripple.
- **Idempotency keys on writes** from clients for safe retries.

---

## 4. Request Flow (typical authenticated request)

```
Client
  │  1. HTTP request + access token (cookie or header)
  ▼
API Gateway / Load Balancer (TLS termination)
  │  2. rate-limit check (Redis)
  ▼
Express middleware chain
  3. request-id (correlation)   → 4. structured log start
  5. auth middleware (verify JWT) → 6. user context
  7. validation (Zod) for body/query/params
  ▼
Route handler → Service layer
  │  business rules + duplicate checks + audit
  ▼
Repository (Mongoose) → MongoDB Atlas
  ▼
Response shaping (DTO) → JSON response (+ request-id header)
  ▼
Client
```

Every response includes `X-Request-Id`. Errors are standardized (`ERROR_HANDLING.md`).

---

## 5. Authentication Flow

See `SECURITY_ARCHITECTURE.md` for details. Summary:

1. Login → server verifies Argon2id hash → issues short-lived access JWT + rotating refresh token (hashed at rest).
2. Refresh token bound to a `deviceId`; rotation on each use; old token added to revocation list (Redis) with TTL.
3. Access token validity ~15 min; refresh ~30 days (configurable, per device).
4. Logout revokes refresh token + device record; "logout all" revokes all.
5. Android: tokens in Android Keystore-protected EncryptedSharedPreferences; biometric/PIN unlock gates access.

---

## 6. Transaction Creation Flow (manual / online)

1. `POST /transactions` with validated payload + idempotency key.
2. Server: auth → validation → duplicate check (fingerprint) → write → recompute dependent aggregates (budget spend, analytics counters) → audit log → response.
3. Aggregates recomputed transactionally or via queued recompute (deferred, eventually consistent within seconds) — chosen at implementation: immediate for hot aggregates, queued for heavy analytics.

## 7. Automatic SMS Transaction Flow (Android → backend)

```
SMS received (or backlog scan)
  → SMS Receiver (BroadcastReceiver / SMS Retriever)
  → Parser (rule sets per bank, multiple formats)
  → Normalizer (canonical draft)
  → Classifier (income/expense, confidence)
  → Duplicate detector (local + synced history)
  → Local store draft (source=sms, status=pending)
  → User review (confirm/edit/reject)   [offline-capable]
  → Sync engine push (confirmed items only)
  → API `POST /sync/push` (idempotent, duplicate-checked server-side)
  → MongoDB canonical transaction
```

Raw SMS text stays **local-only** by default; only extracted structured fields + non-sensitive refs sync. (See `SMS_TRANSACTION_ARCHITECTURE.md`.)

## 8. OCR Flow

1. Web/Android uploads receipt → `POST /receipts` (MIME/size/scan validation) → stored encrypted in object storage.
2. OCR job queued → provider adapter runs → raw extraction.
3. Normalizer maps to draft transaction (merchant, amount, date, items, tax, total, payment method) with per-field confidence.
4. Duplicate check vs ledger.
5. Draft returned to user for review; transaction created only after confirmation (or auto-commit if high confidence AND user enabled it).
6. Transaction records `receiptId`, `ocrConfidence`.

## 9. AI Insight / Assistant Flow

1. User asks question (`POST /ai/chat`) or system triggers insight recompute.
2. **Intent detection** (lightweight classifier) maps question → financial analysis operation.
3. **Analytics layer** computes structured, bounded answer data (no raw DB to model).
4. **Grounded prompt** built: data + question + safety rules; sent to AI provider adapter.
5. Response returned with references (categories/periods). AI never sees raw PII, never writes data.
6. Optionally streamed.

## 10. Offline Synchronization Flow

1. Client writes locally: canonical entity gets `clientId` + `syncState=pending`, op enqueued with idempotency key.
2. Reconnect → `GET /sync/changes?cursor=...` (pull) then `POST /sync/push` (batch ops).
3. Server applies each op idempotently (dedupe by idempotency key / clientId), returns per-op result and canonical state.
4. Client merges: canonical `updatedAt`/`rev` wins; conflicts resolved (default: server-wins; user-visible for semantic conflicts).
5. Cursor updated; queue drained; `syncState=synced`.
6. Full details in `SYNC_ARCHITECTURE.md`.

## 11. Multi-Device Synchronization

- Same user, multiple devices: each device maintains its own cursor and queue.
- Server serializes via `rev`/`updatedAt` on documents; idempotency keys prevent duplicate ops.
- Deletes are tombstones until all devices pass the deletion cursor (retention window).
- Conflict policy is uniform across devices (deterministic), so convergence is guaranteed.

## 12. Cloud Backup Flow

- Opt-in. Client encrypts bundle with user-derived key → `POST /backups` → encrypted object in storage + `backups` record → restore downloads, verifies checksum, decrypts locally.

---

## 13. Async Job Architecture

- Jobs: `import:parse`, `import:commit`, `export:generate`, `report:pdf`, `ocr:process`, `ai:insight`, `email:send`, `sync:notify`.
- Producer: API writes job to queue (Redis/BullMQ or cloud queue) with `jobId`.
- Consumer: worker processes (same service code, separate process/container); updates job status in `jobs` collection; status surfaced via `GET /jobs/:id` or resource status.
- Retry with exponential backoff + dead-letter queue (DLQ) for inspection.
- This keeps OCR/AI/PDF latency off the request path.

---

## 14. Scaling & Evolution

- **Phase 2 start:** modular monolith (single API deployable, vertical slices). Lowest ops cost, high coherence.
- **Trigger for split:** sustained load / team boundaries justify extracting slices (e.g., `reports`, `ai`) into separate services sharing the same message schemas + event bus.
- API replicas scale horizontally (stateless); MongoDB Atlas scales via tiering + indexes; heavy analytics can move to read replicas/aggregate collections; jobs scale via queue workers.
- Eventual event-bus (e.g., Kafka) is a future option; Phase 1 design keeps slices decoupled via service interfaces so extraction is mechanical.

---

## 15. Architectural Constraints & Trade-offs

- **MongoDB single source of truth + Redis cache/queue:** trade-off — eventual consistency for analytics (seconds), accepted; strict transaction isolation via document-level writes + retries.
- **Adapter-isolated external providers:** extra indirection but prevents vendor lock-in (locked requirement).
- **Job-based OCR/AI/PDF:** adds infrastructure (queue) but keeps requests fast and retryable.
- **Local-first Android:** more client engineering, but delivers offline-first + privacy (locked requirement).
- **REST now, GraphQL/WebSocket later:** REST is simple, cacheable, and sufficient; streaming AI may later add SSE.

---

## 16. Related Documents

- Technology choices & rationale: `TECH_STACK.md`
- Data model: `DATABASE_ARCHITECTURE.md`
- Endpoints: `API_ARCHITECTURE.md`
- Security: `SECURITY_ARCHITECTURE.md`
- Sync: `SYNC_ARCHITECTURE.md`
- Decisions: `adr/`
