# MoneyTalks

Personal finance platform. Money, tracked simply.

Monorepo (pnpm workspaces): Express + TypeScript API, React web app, Android companion (Gradle-independent). See `docs/phase-1/` for the approved architecture.

## Layout

```
apps/       deployables (api, web, android)
packages/   shared libraries (shared, validation, types, config, clients)
docs/       architecture & phase documents
infra/      IaC, CI/CD (future phases)
```

## Current phase

- **Phase 2 (in progress):** backend foundation + authentication.
  - API: `apps/api` (Express + TypeScript + Mongoose)
  - Shared contracts: `packages/validation`, `packages/types`, `packages/shared`
  - Tooling config: `packages/config`

## Prerequisites

- Node.js >= 20.19 (bundled corepack)
- MongoDB (local `mongod` or Atlas URI) — tests auto-provision an in-memory server when `MONGODB_URI` is unset

## Getting started

```bash
corepack pnpm install        # install workspace deps (pnpm via corepack)
corepack pnpm dev            # start API on http://localhost:3000
```

## Scripts (run from repo root)

| Command | Description |
|---|---|
| `pnpm dev` | Start the API in watch mode |
| `pnpm typecheck` | Typecheck all workspace packages |
| `pnpm lint` | ESLint (flat config) over the repo |
| `pnpm test` | Run API tests |
| `pnpm format` | Prettier write |

> Note: `pnpm` is invoked via `corepack pnpm` if the global shim is not installed (e.g. `corepack enable` needs admin rights on Windows).
