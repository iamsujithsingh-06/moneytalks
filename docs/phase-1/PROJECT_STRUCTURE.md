# MoneyTalks — Project Structure (Phase 1)

> Status: Approved. Structure is a **pnpm-workspace monorepo**. No application code is created in Phase 1.

---

## 1. Principles

1. **Monorepo** for shared types/validation/config across web + api + android.
2. **Vertical slices** in the API (feature-first, not layer-first) so each domain is cohesive.
3. **Shared contracts** (`packages/*`) are the single source of truth for types + runtime validation.
4. **Boundaries clear:** `apps/*` are deployables; `packages/*` are libraries; `docs/` documents decisions.
5. Android is not part of the pnpm graph (its own Gradle build) but reads shared contracts via generated artifacts (OpenAPI → Kotlin types).

---

## 2. Top-Level Layout

```
money-talks/                          # repo root
├── apps/
│   ├── web/                          # React + Vite + TS + Tailwind SPA
│   ├── api/                          # Node + Express + TS (modular monolith, vertical slices)
│   └── android/                      # Kotlin native companion (own Gradle build)
├── packages/
│   ├── shared/                       # shared pure logic + DTOs
│   ├── validation/                   # Zod schemas (source of truth for runtime validation)
│   ├── types/                        # TS types (consumes validation via z.infer)
│   ├── config/                       # shared configs (eslint, tsconfig, prettier, design tokens)
│   └── clients/                      # typed API client (web) generated from contracts
├── infra/                            # IaC (Terraform/Docker compose), CI/CD, secrets templates
├── scripts/                          # repo tooling (codegen, migration runner, docs checks)
├── docs/
│   ├── phase-1/                      # this phase (architecture)
│   │   ├── adr/                      # architecture decision records
│   │   └── ...
│   └── (future phases)
├── package.json                      # workspace root
├── pnpm-workspace.yaml
├── turbo.json                        # task orchestration (optional but recommended)
└── README.md
```

---

## 3. `apps/web`

```
apps/web/
├── src/
│   ├── app/            # routing, providers, layout shell
│   ├── features/       # feature modules (vertical): auth, dashboard, transactions,
│   │                   #   budgets, goals, analytics, reports, receipts, import/export,
│   │                   #   settings, ai-assistant, notifications, devices, security
│   │   └── <feature>/
│   │       ├── components/
│   │       ├── hooks/
│   │       ├── api/            # TanStack Query hooks using packages/clients
│   │       ├── state/          # Zustand slices (UI state only)
│   │       └── index.ts        # public surface
│   ├── components/     # shared UI primitives (design system)
│   ├── lib/            # client utils (currency, dates, formatting)
│   ├── styles/         # Tailwind + tokens
│   ├── tests/          # unit + component tests
│   └── main.tsx
├── public/
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

## 4. `apps/api`

```
apps/api/
├── src/
│   ├── server.ts           # bootstrap (express, middleware, routes, error handler)
│   ├── app.ts              # app factory (testable without listening)
│   ├── config/             # env schema + typed config (Zod)
│   ├── middlewares/        # auth, validation, request-id, rate-limit, error, logging
│   ├── routes/             # thin HTTP mapping → controllers (one per resource group)
│   ├── modules/            # VERTICAL SLICES:
│   │   ├── auth/           #   register/login/refresh/logout/devices/password
│   │   ├── users/
│   │   ├── transactions/   #   incl. categorization, dedupe, search
│   │   ├── categories/
│   │   ├── budgets/
│   │   ├── savings-goals/
│   │   ├── analytics/      #   computed data layer (AI reads THIS)
│   │   ├── dashboard/
│   │   ├── recurring/
│   │   ├── import-export/
│   │   ├── reports/
│   │   ├── receipts/       #   OCR orchestration
│   │   ├── sync/           #   cursor, push/pull, bootstrap
│   │   ├── notifications/
│   │   ├── ai/             #   intent → analytics → prompt → provider
│   │   ├── settings/
│   │   └── security/       #   audit, backups
│   │   └── <slice>/
│   │       ├── controller.ts
│   │       ├── service.ts       # business rules (single place)
│   │       ├── repository.ts    # data access (userId-scoped)
│   │       ├── dto.ts           # request/response DTOs
│   │       ├── routes.ts
│   │       └── __tests__/
│   ├── providers/          # ADAPTERS: OcrProvider, AiProvider, EmailProvider,
│   │                       #   ObjectStorage, PdfRenderer, QueueProvider
│   ├── jobs/               # workers (import parse, export, report, ocr, ai insights)
│   ├── db/                 # mongoose connection, schema definitions, index definitions, migrations
│   ├── lib/                # idempotency, rate-limit, audit, fingerprinting, pagination
│   └── app-types/          # express augmentation (request ctx)
├── openapi/                # generated/owned OpenAPI spec (source for packages/clients)
├── tests/                  # integration + e2e (Supertest)
├── tsconfig.json
├── package.json
└── Dockerfile
```

### Slice responsibility rule
`routes → controller → service → repository` one direction only. Controllers never touch the DB; repositories never hold business rules. Providers are injected into services (interface-first) — this is what makes OCR/AI/email/PDF swappable.

## 5. `apps/android`

```
apps/android/                       # Gradle project (independent build)
├── app/
│   └── src/main/
│       ├── java/com/moneytalks/
│       │   ├── MainActivity.kt
│       │   ├── MoneytalksApp.kt            # Application, DI (Hilt)
│       │   ├── di/
│       │   ├── core/                       # networking (Retrofit), security (Keystore), 
│       │   │   │                           #   local storage (Room), sync engine, utils
│       │   ├── data/
│       │   │   ├── local/                  # Room entities, DAOs, SQLCipher config
│       │   │   ├── remote/                 # API interfaces + DTOs (generated from OpenAPI)
│       │   │   └── repository/
│       │   ├── sms/
│       │   │   ├── receiver/               # broadcast receivers
│       │   │   ├── detection/              # filter/detect
│       │   │   ├── parser/                 # rule sets + engine (versioned)
│       │   │   ├── normalizer/
│       │   │   ├── classifier/
│       │   │   └── dedupe/
│       │   ├── sync/                       # SyncEngine, WorkManager workers, backoff
│       │   ├── feature/                    # UI features (auth, dashboard, review queue,
│       │   │   │                           #   transactions, budgets, goals, settings, applock)
│       │   └── ui/                         # design system components (Compose)
│       └── res/
├── build.gradle.kts
├── settings.gradle.kts
└── gradle/
```

## 6. `packages/*`

### `packages/shared`
- Pure domain logic + DTOs shared across web/api: money helpers (minor units), date/period utilities, enums (`TransactionType`, `Source`, `Status`), duplicate fingerprint builders, business constants (limits, thresholds).
- **No framework imports** — importable anywhere.

### `packages/validation`
- **Source of truth for runtime validation.** Zod schemas for every API contract + entities.
- Export `z.infer` types consumed by `packages/types`.
- Consumed by: api (server-side validation), web (client validation + forms), codegen for android.

### `packages/types`
- TS types (composed from validation schemas) + request/response DTOs.
- Re-exported to web/api. Kept separate so validation internals can evolve.

### `packages/config`
- Shared tooling config: `tsconfig` base, eslint flat config, prettier, tailwind tokens (design tokens JSON shared web/android-theming reference).
- CI consumes these.

### `packages/clients`
- Typed API client (fetch-based) generated from OpenAPI spec; used by web and reused conceptually by Android (Retrofit interfaces generated separately).

## 7. `infra/` & `scripts/`

- `infra/`: Docker compose (local dev: api, mongo, redis, worker), Terraform (prod resources: Atlas, object storage, queue, email, DNS, WAF), GitHub Actions workflows, secret templates (no real secrets).
- `scripts/`: `codegen` (OpenAPI → TS + Kotlin), `migrate` (db migrations), `docs:check` (link/consistency checks for this phase docs), `dev` orchestration.

## 8. `docs/`

```
docs/
├── phase-1/
│   ├── adr/                     # ADR-001..008
│   ├── PRODUCT_REQUIREMENTS.md
│   ├── USER_FLOWS.md
│   ├── SYSTEM_ARCHITECTURE.md
│   ├── TECH_STACK.md
│   ├── DATABASE_ARCHITECTURE.md
│   ├── API_ARCHITECTURE.md
│   ├── SECURITY_ARCHITECTURE.md
│   ├── SYNC_ARCHITECTURE.md
│   ├── SMS_TRANSACTION_ARCHITECTURE.md
│   ├── OCR_ARCHITECTURE.md
│   ├── AI_ARCHITECTURE.md
│   ├── DOCUMENT_ARCHITECTURE.md
│   ├── PROJECT_STRUCTURE.md
│   ├── DESIGN_SYSTEM.md
│   ├── NFR.md
│   ├── ERROR_HANDLING.md
│   ├── OBSERVABILITY.md
│   ├── ROADMAP.md
│   └── PHASE_1_CHECKLIST.md
└── (phase-2+ land here)
```

## 9. Responsibility Map

| Area | Owns | Consumed by |
|---|---|---|
| Domain types + validation | `packages/validation`, `packages/types` | web, api, (android via codegen) |
| Pure business helpers | `packages/shared` | web, api, android |
| HTTP surface | `apps/api` (OpenAPI) | web client, android client |
| UI | `apps/web`, `apps/android` | — |
| Adapters (OCR/AI/email/PDF/storage/queue) | `apps/api/src/providers` | api slices |
| Infra | `infra/` | deploy |
| Decisions & specs | `docs/phase-1/` | all teams |

## 10. Dependency Direction

```
docs (nothing depends on it)
apps/web ──▶ packages/clients ──▶ packages/types ──▶ packages/validation ──▶ packages/shared
apps/api ──▶ packages/* (same chain)
apps/android ──▶ generated contracts + its own Gradle deps
```
- No package depends on an app. No app depends on another app. Shared code has zero framework/DB imports.

## 11. Why This Structure

- **Scalable:** vertical slices can be extracted into services without moving logic.
- **Type-safe end-to-end:** one validation source; generated clients; no schema drift.
- **Vendor-free core:** adapters isolate external providers (OCR/AI/email/PDF/storage).
- **Future-ready:** Android + web share contracts; sync protocol is one spec.
- Trade-offs: monorepo CI must be disciplined (turbo/task graph), Android inside repo adds repo weight (Gradle is independent), generated code churn is managed by codegen CI.
