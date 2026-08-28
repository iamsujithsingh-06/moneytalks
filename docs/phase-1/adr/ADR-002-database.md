# ADR-002: Database

- **Status:** Accepted
- **Date:** Phase 1
- **Related:** `DATABASE_ARCHITECTURE.md`, `SYNC_ARCHITECTURE.md`

## Context
MoneyTalks needs a durable, scalable system of record for user-scoped financial data, with strong support for:
- an evolving transaction schema (5 types × 4 sources + provenance/confidence fields),
- offline-first sync (idempotency, cursors, tombstones, rev-based conflicts),
- duplicate prevention (unique fingerprints),
- per-user isolation and query performance,
- managed operations (backups, scaling, security).

## Decision
Use **MongoDB Atlas** (managed) with **Mongoose** ODM.

Design implications accepted:
- Zod schemas in `packages/validation` are the source of truth for write shape; Mongoose schemas mirror them (codegen-friendly).
- Compound, user-scoped unique indexes for idempotency (`{userId, clientId}`) and fingerprints.
- Money stored as integer minor units (never floats) — DB-agnostic decision.
- Analytics via aggregation pipelines; optional derived aggregate collections behind a Phase 4 measurement gate.
- Multi-document transactions available but used sparingly; most writes are single-document + queued recompute.
- Soft-delete tombstones + retention for sync.

## Alternatives Considered
- **PostgreSQL** — strong relational integrity and analytics; would require migration tooling earlier, more ops, and a different sync/duplicate story. Chosen as the serious runner-up; the repository layer and shared validation keep a future migration contained.
- **MySQL** — similar to Postgres with weaker JSON ergonomics.
- **DynamoDB** — schema rigidity and query modeling friction for flexible entities + analytics.
- **Firestore** — realtime/nice client DX but weaker analytical queries, vendor lock, and online-only bias that complicates our offline-first guarantees.

## Trade-offs
- Document model trades relational integrity for schema flexibility → mitigated by Zod + strict indexes.
- No built-in server-side relations → referential integrity enforced in service layer + tests.
- Requires index discipline; hot paths indexed up front.
- Managed Atlas costs vs self-hosted ops overhead → acceptable for production posture.

## Consequences
- Phase 2 scaffolds Mongo schemas + indexes for users/devices/audit/config.
- Duplicate + sync requirements shape the transaction collection (fingerprints, clientId, rev, tombstones) — do not skip.
- Analytics read paths are aggregation-driven; revisit bucket collections at Phase 4 with measured latency.
