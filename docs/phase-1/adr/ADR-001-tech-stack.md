# ADR-001: Technology Stack

- **Status:** Accepted
- **Date:** Phase 1
- **Related:** `TECH_STACK.md`

## Context
MoneyTalks is a personal finance platform with a web client, an offline-first Android companion, a Node backend, MongoDB, and external OCR/AI/file providers. The stack must be productive, typed, scalable, and support shared contracts between web/API/Android. Full rationale and alternatives for each layer are in `TECH_STACK.md`.

## Decision
- **Frontend:** React + Vite + TypeScript + Tailwind CSS (+ TanStack Query, Zustand, React Router, Recharts).
- **Backend:** Node.js (LTS) + Express + TypeScript, modular monolith with vertical slices.
- **Database:** MongoDB Atlas + Mongoose (see ADR-002).
- **Validation:** Zod, shared across web/api (`packages/validation`).
- **Auth:** JWT access + rotating refresh tokens (see ADR-003).
- **Android:** Kotlin, Jetpack Compose, Room, Hilt, WorkManager, Android Keystore, BiometricPrompt, Retrofit.
- **Local storage (mobile):** Room (SQLite) + SQLCipher + EncryptedSharedPreferences/Keystore.
- **Local storage (web):** IndexedDB (Dexie) + localStorage for prefs.
- **PDF:** server-side templated rendering (pdfmake/pdf-lib first; headless-HTML option behind `PdfRenderer` adapter).
- **Excel/CSV:** ExcelJS (server) + fast-csv/custom; client preview via SheetJS CE if needed.
- **OCR / AI / Email / Object storage / Queue:** provider adapters (`providers/`) with interface-first contracts; chosen vendors swappable.
- **Monorepo:** pnpm workspaces (see ADR-008).

## Alternatives Considered
- Next.js SSR (unneeded for an authed SPA; muddies API boundary), Vue/Svelte (smaller ecosystem for finance dashboards).
- NestJS/Fastify/Hono (Nest heavier, Fastify/Hono smaller ecosystem; Express is stable + boring).
- PostgreSQL instead of Mongo (see ADR-002).
- Flutter/React Native for mobile (cannot meet SMS/Keystore/local-first requirements as cleanly).
- Chart.js/ECharts/D3 (Recharts = best DX for React + SVG + theming).
- SheetJS as default Excel lib (license/compliance concerns → ExcelJS).

## Trade-offs
- Express is unopinionated → we impose structure via vertical slices + shared middleware + Zod.
- Mongo flexibility traded against disciplined schema/index management (addressed in ADR-002).
- Node vs Go/Kotlin: we trade raw throughput for one-language monorepo productivity.
- Two client codebases (web + Android) are required for the product goals.

## Consequences
- Shared Zod schemas/types are the single source of truth → no contract drift.
- All external providers behind adapters → swap without architecture change.
- Monorepo discipline required (turbo/task graph, codegen for clients).
- Phase 2 can scaffold immediately from `PROJECT_STRUCTURE.md`.
