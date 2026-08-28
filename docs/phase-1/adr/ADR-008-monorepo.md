# ADR-008: Monorepo Structure

- **Status:** Accepted
- **Date:** Phase 1
- **Related:** `PROJECT_STRUCTURE.md`

## Context
MoneyTalks ships three surfaces (web, API, Android) that must share types, validation schemas, DTOs, and design tokens without drift. The team is small; coherence and onboarding speed matter; the architecture must scale to extracted services later.

## Decision
- **pnpm-workspace monorepo:**
  - `apps/web` — React/Vite SPA.
  - `apps/api` — Express modular monolith (vertical slices).
  - `apps/android` — Kotlin/Gradle (not part of the pnpm graph; consumes shared contracts via generated OpenAPI → Kotlin DTOs).
  - `packages/shared` — pure domain logic/DTOs (no framework imports).
  - `packages/validation` — Zod schemas = single source of truth for runtime validation; types inferred for `packages/types`.
  - `packages/config` — shared eslint/tsconfig/prettier + design tokens.
  - `packages/clients` — generated typed API client (web).
  - `infra/`, `scripts/`, `docs/`.
- **Dependency direction:** apps → packages (downward only); packages never depend on apps; Android uses generated contracts.
- **Contracts-first:** OpenAPI spec owned by API; codegen produces TS client (web) and Kotlin DTOs (Android); shared Zod schemas validate server + client.
- **Task orchestration:** turbo (or pnpm filters) for build/lint/test/typecheck ordering; CI gates typecheck + lint + tests + contract checks.
- **Android inside the repo** keeps sync of specs/contracts and docs; its Gradle build stays independent (not run by pnpm).

## Alternatives Considered
- Separate repos per app — contract drift, duplicate schemas, harder onboarding → rejected.
- Polyrepo with published packages — publishing overhead + version churn for a single team → rejected.
- Gradle-only repo for Android elsewhere — drift between API spec and Android DTOs → rejected.
- Nx — capable but heavier config than needed; turbo/pnpm is sufficient → not chosen.

## Trade-offs
- Monorepo requires CI/task discipline (turbo graph) and periodic repo hygiene (generated code churn managed by codegen).
- Android inside a pnpm repo adds a foreign build system → isolated (Gradle ignores pnpm) with clear ownership boundaries.
- Shared code must stay framework-free to be importable on Android/web.

## Consequences
- Phase 2 scaffolding follows this exact structure; shared validation prevents contract drift from day one.
- Vertical slices in the API mean a future service extraction is mechanical (slice code moves, adapters already injectable).
- Docs live in-repo (`docs/phase-1/`) — architecture is versioned with code.
