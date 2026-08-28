# MoneyTalks — Technology Stack (Phase 1)

> Status: Approved. Every major choice includes: why needed, why preferred, alternatives, trade-offs.

---

## Stack Summary

| Layer | Choice | Rationale (short) |
|---|---|---|
| Frontend | React + Vite + TypeScript + Tailwind CSS | Mature, fast DX, typed, design-system friendly |
| Backend | Node.js + Express + TypeScript | Matches team stack, huge ecosystem, simple to scale |
| Database | MongoDB Atlas + Mongoose | Flexible schema for evolving transaction shapes; managed |
| Auth | JWT (short-lived) + rotating refresh tokens | Stateless access + revocable sessions |
| Validation | Zod | Runtime schema validation shared web/api; type inference |
| Android | Kotlin + Jetpack (native) | Native SMS APIs, Keystore, best offline/perf story |
| Local storage (mobile) | Room (SQLite) + Android Keystore + EncryptedSharedPreferences | Transactional, offline-first, encrypted |
| Local storage (web) | IndexedDB via Dexie + localStorage fallback | Offline-first web snapshots |
| Charts | Recharts (web) + Compose-based custom charts (Android) | React-native, declarative, accessible-ish |
| PDF | Server-side templated render (puppeteer + HTML/CSS template) | Brand control, precise layout |
| Excel | ExcelJS (server) + SheetJS (client preview, if needed) | Streaming, well-maintained |
| OCR | Adapter-isolated cloud OCR (Document AI / Textract / Azure DI) | Highest accuracy, no device constraints |
| AI | Provider-independent adapter (OpenAI/Anthropic/Gemini/self-hosted) | No vendor lock-in (locked requirement) |
| Job queue | BullMQ on Redis (self-managed) or cloud queue | Async OCR/AI/import/export/PDF |
| Cache | Redis (managed) | Rate limiting, revocation, cursors |
| Object storage | Cloud object storage (S3/GCS/Azure Blob) | Receipts, PDFs, exports, backups |

---

## 1. Frontend

### React + Vite + TypeScript
- **Why needed:** interactive dashboard-heavy SPA.
- **Why preferred:** React = largest ecosystem + hiring pool; Vite = fast HMR/builds, first-class TS; TypeScript = type safety across shared contracts.
- **Alternatives:** Vue/Nuxt, Svelte, Next.js (SSR), Angular.
- **Trade-offs:** SSR benefits (SEO) are irrelevant for a logged-in finance app; Next.js adds server ops we don't need for Phase 1 and muddies the "API-only backend" boundary. Vite+SPA keeps deployment trivial (static hosting) and the backend purely REST.

### Tailwind CSS
- **Why needed:** premium dark-first design system, consistent tokens, responsive.
- **Why preferred:** utility-first, token-driven theming, no runtime CSS overhead, works with the design system in `DESIGN_SYSTEM.md`.
- **Alternatives:** CSS Modules, styled-components, vanilla-extract, CSS-in-JS.
- **Trade-offs:** class clutter vs. speed + consistency; mitigated via a small set of component primitives and design tokens.

### State / data
- **TanStack Query** for server state (caching, retries, sync of async jobs) + **Zustand** for small UI state. Alternatives: Redux Toolkit, React Query alone. Trade-off: Redux boilerplate not justified; React Query handles the async heavy lifting.

### Routing
- React Router. Alternatives: TanStack Router. Fine either way; React Router is the default choice for ecosystem maturity.

---

## 2. Backend

### Node.js + Express + TypeScript
- **Why needed:** REST API, job orchestration.
- **Why preferred:** one language across web/api/shared packages (monorepo); enormous ecosystem; async I/O fits IO-heavy finance workloads; Express is stable and boring; TypeScript for safety + shared types.
- **Alternatives:** NestJS (framework w/ DI), Fastify, Hono, Go, Kotlin/Ktor.
- **Trade-offs:** Express is unopinionated — we impose structure via vertical-slice layout, shared middleware, and Zod. Fastify is faster but smaller ecosystem; NestJS is heavier and more opinionated than needed for a modular monolith. Node keeps team productivity high.

### Runtime / tooling
- Node 20+ LTS; pnpm workspaces (monorepo); tsx/tsc for dev; ESLint + Prettier; Vitest + Supertest for tests; esbuild/vite-node for speed if needed.

---

## 3. Database — MongoDB Atlas + Mongoose

- **Why needed:** single system of record.
- **Why preferred:** document model maps well to evolving, schema-rich entities (transactions with nested source/raw fields); Atlas = managed (backups, scaling, security, TLS); no schema migrations to coordinate for early iteration; indexes cover hot paths.
- **Alternatives:** PostgreSQL, MySQL.
- **Trade-offs:** Mongo has no server-side multi-document transactions historically (now supports multi-doc transactions) and requires discipline on indexes/validation. Postgres is stronger for relational integrity + advanced analytics. We mitigate Mongo trade-offs with: strict Zod-validated writes, Mongoose schemas, compound indexes, and a documented duplicate-fingerprint unique index. The modular repository layer keeps a future DB swap contained. **Note:** a Postgres flavor was seriously considered — see `adr/ADR-002-database.md`.

### Redis (managed)
- Rate limiting counters, refresh-token revocation list, sync cursor cache, BullMQ broker.
- Alternatives: in-memory (breaks on multi-replica), Postgres-based queue (slower). Trade-off: one more service, but managed.

---

## 4. Authentication

- JWT access tokens (short-lived, ~15 min) + rotating refresh tokens (opaque, hashed at rest, ~30 days).
- Refresh rotation: each refresh mints a new token and revokes the old (detects replay → revoke family).
- Bound to `deviceId`. See `SECURITY_ARCHITECTURE.md`.
- Alternatives: sessions in Redis, opaque-only tokens. Trade-off: JWT access tokens enable stateless validation (good for horizontal scale) at the cost of revocation latency — mitigated by short TTL + revocation list for emergencies.

---

## 5. Validation — Zod

- **Why needed:** runtime validation on every API boundary; shape shared with clients (same schemas).
- **Why preferred:** TypeScript-native inference (`z.infer`), zero-config client/server sharing in monorepo, rich error messages, transforms.
- **Alternatives:** Yup, Joi, io-ts, Valibot, Ajv.
- **Trade-offs:** Zod slightly slower than Ajv at extreme scale (irrelevant here); Yup weaker TS inference; io-ts stronger but awkward DX. Zod is the best DX/safety balance.

---

## 6. Android — Kotlin + Native (Jetpack)

- **Why needed:** SMS/notification detection requires platform APIs (BroadcastReceiver, SMS Retriever, Notifications), Keystore for biometric/PIN, background WorkManager, offline Room DB.
- **Why preferred:** Kotlin = modern, safe, first-class Android; native = full access to platform security + SMS features; Compose = modern declarative UI matching design system; Room = typed, transactional SQLite; DataStore + Keystore = secure prefs; Hilt = DI.
- **Alternatives:** Flutter/React Native (cross-platform), native Java (legacy).
- **Trade-offs:** Native = 2 codebases (web + Android) but is the only way to meet locked SMS/Keystore/local-first requirements reliably. Flutter/RN struggle with SMS privacy APIs and Keystore/bio integration, and hurt the "serious financial product" feel.

### Android-specific libs
- Room (local ledger + sync queue), DataStore + Android Keystore (secrets), WorkManager (scheduled sync, OCR/backlog), Hilt (DI), Coil (images), Jetpack Compose + Material 3 (UI), KotlinX Coroutines/Flow (async), Navigation Compose, BiometricPrompt.

---

## 7. Local Storage (offline-first)

### Android — Room (SQLite)
- **Why selected:** local-first ledger + sync queue must be transactional (a transaction write and its sync op must be atomic); SQLite gives ACID. Room adds compile-time-checked queries and Flow reactive APIs.
- **Alternatives:** Realm, SQLDelight, plain SQLite.
- **Trade-offs:** Realm (now Atlas Device SDK) is convenient but heavier, license/compat churn; SQLDelight is Kotlin-first and strong, but Room is the platform-standard, best documented, and integrates with Compose/WorkManager cleanly. Encrypted Room via SQLCipher is the Phase 2+ hardening step (app-lock ties DB key to Keystore/PIN).

### Web — IndexedDB (Dexie) + localStorage
- **Why selected:** web offline snapshot caching for last-known dashboard/ledger; IndexedDB is the only adequate browser store for lists; Dexie gives a pleasant promise API. localStorage only for tiny preferences (theme).
- **Alternatives:** localStorage alone (too small), SQLite/WASM (overkill for web snapshot), service-worker-only caching.
- **Trade-offs:** IndexedDB API is verbose → Dexie wrapper; full offline CRUD on web is deferred (PWA later) — Android is the primary offline surface; web is read-mostly offline snapshot.

---

## 8. Charts — Recharts (web)

- **Why needed:** dashboard + analytics visualizations (line/bar/pie/area, cash-flow, category breakdowns).
- **Why preferred:** declarative, React-native, SVG (crisp + accessible-ish), no canvas complexity, tree-shakeable, active maintenance, good theming for dark mode.
- **Alternatives:** Chart.js (imperative, React wrapper), ApexCharts (rich but heavier/licensing care), ECharts (powerful, large bundle), D3 (full control, high effort), visx (low-level).
- **Trade-offs:** Recharts trades a little performance at extreme data sizes for DX; mitigation: server-side aggregation (analytics endpoints return pre-aggregated buckets) so clients never chart raw transaction dumps.
- **Android:** Compose Canvas-based custom charts (small custom set) or a lightweight Compose chart lib — decided at implementation; dashboard charts on Android are simple, so custom avoids dependency risk.

---

## 9. PDF — server-side templated rendering

- **Recommended:** render an HTML/CSS report template in a headless browser (Puppeteer) → print to PDF; or a pure-TS PDF lib (pdfmake/pdf-lib) for simpler layouts.
- **Why:** full brand/typography control (premium monthly report), robust CJK-safe text handling, easy to add charts (render chart image → embed).
- **Alternatives:** React-PDF (client), PDFKit/pdf-lib (programmatic), reportlab/Python (server).
- **Trade-offs:** Puppeteer = Chromium dependency (deploy weight) but best fidelity; pdfmake = lighter, slightly less layout control. Decision: start with pdfmake/pdf-lib for structured tables; upgrade to headless-HTML pipeline if the design demands it. Both are adapter-isolated behind `PdfRenderer` interface.

---

## 10. Excel — ExcelJS

- **Why needed:** parse bank/UPI CSV/Excel exports; generate Excel exports.
- **Why preferred:** streaming read/write, good type coverage, works server-side (Node) without DOM; CSV handled by the same pipeline (fast-csv or custom).
- **Alternatives:** SheetJS (Community Edition now older/unsupported; commercial for latest), python openpyxl, xlsx-populate.
- **Trade-offs:** ExcelJS has a smaller surface than SheetJS for exotic formats; acceptable for standard .xlsx. SheetJS Community license/compliance is the reason to avoid it as default. Client-side preview (web) can use a minimal parser (SheetJS CE or exceljs via bundler) — decided at implementation.

---

## 11. OCR — adapter-isolated cloud OCR

- **Recommended architecture:** `OcrProvider` interface; default provider = a major cloud Document AI service (Google Cloud Document AI, AWS Textract, Azure Document Intelligence) chosen at implementation time by evaluation (accuracy on Indian receipts, latency, cost, data-residency). Result schema is ours; provider is swappable.
- **Why:** receipts are camera photos with noisy layouts; cloud ML OCR is far more accurate than Tesseract and costs nothing to re-tune per format.
- **Alternatives:** Tesseract (self-hosted, free, weaker), Apple Vision / ML Kit on-device (fast, offline, weaker on complex receipts; good as a pre-extract for Android), provider-specific SDK directly (couples us).
- **Trade-offs:** cloud OCR sends image data to a third party → mitigated by user consent, data-minimization (only the receipt image), retention/deletion policy, and encryption in transit/at rest. Document the provider's processing terms in the privacy flow.

## 12. AI — provider-independent adapter

- **Recommended:** `AiProvider` interface over an LLM (OpenAI-compatible, Anthropic, Gemini, or self-hosted vLLM/Ollama). The **AI orchestration layer** (intent → analytics → grounded prompt) lives in our code; the model is a swappable dependency.
- **Why:** locked requirement: no coupling to one vendor; lets us tune cost/latency/quality and fail over.
- **Alternatives:** single-vendor SDK everywhere (coupling), rule-based NLP only (fragile).
- **Trade-offs:** an abstraction adds a thin layer; mitigated by keeping the interface small and the grounded-data contract the real boundary.

## 13. Email / Notifications

- Transactional email via a provider adapter (Resend/SES/Postmark — decided at implementation by deliverability + cost). Push: FCM for Android alerts (P2). No notification stack in Phase 2 besides email essentials (verification, reset).

## 14. Observability & Infra (managed where possible)

- Logging: pino (JSON, low overhead) with request IDs. Metrics: OpenTelemetry + a managed metrics backend. Tracing: OTEL. Health checks: `/health` + readiness. See `OBSERVABILITY.md`.
- Deployment: containerized (Docker), horizontal API replicas, static web hosting, managed Mongo/Redis/object storage. CI/CD: GitHub Actions. Secrets: managed secrets store.

---

## 15. Version & Package Strategy

- **pnpm workspaces** monorepo with `packages/shared` (types, DTOs), `packages/validation` (Zod schemas), `packages/config` (eslint/ts/theme tokens). Shared contracts compiled to TS; no runtime duplication of validation logic.
- Lockfile committed; CI verifies `tsc --noEmit` + lint + tests across workspaces.

---

## 16. Stack Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Mongo schema drift | Zod schemas as source of truth; Mongoose schemas generated/kept in sync; migration scripts in repo |
| Chart perf on big ranges | Server-side aggregation; pre-aggregated buckets |
| Puppeteer deploy weight | Choose pdfmake first; PDF renderer interface for swap |
| OCR cost/latency | Adapter + caching by receipt hash; size limits; user consent |
| AI cost/latency/hallucination | Adapter + grounded prompt contract; computed data only; no raw PII to model |
| LLM vendor churn | Adapter interface + model config in one place |
| SMS format churn | Rule-based parser with versioned rule sets, test corpus, overrides (see SMS doc) |
| Vendor policy changes (OCR/AI/email) | All providers behind interfaces; contracts tested with contract tests |
