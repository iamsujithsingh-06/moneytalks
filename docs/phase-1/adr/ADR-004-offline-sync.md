# ADR-004: Offline-First Synchronization & Conflict Resolution

- **Status:** Accepted
- **Date:** Phase 1
- **Related:** `SYNC_ARCHITECTURE.md`

## Context
MoneyTalks requires offline-first capture on Android, multi-device consistency, and absolute invariants: no duplicate transactions, no data loss, no infinite sync loops, no silent overwrite of valid data. Design must be decided before transaction CRUD is implemented (locked rule).

## Decision
**Protocol:** per-device pull-then-push sync with cursors:
- Every client-created entity gets a `clientId` (UUID) before any network call; unique index `{userId, clientId}`.
- Local ops queue atomic with the data write (Room transaction); ops frozen (payload immutable) for deterministic replay.
- Push is idempotent (`idempotencyKey`, `clientId`); server upserts, never blindly inserts.
- Pull uses monotonic `updatedAt` cursors per entity (`sync_records`); deletes are tombstones with retention window.
- Retry: exponential backoff + jitter, cap ~5 min; permanent failures surfaced to user.

**Conflict resolution — LWW-SV with field-level merge:**
- Last-writer-wins decided by **server-verified `updatedAt`** (never client clocks).
- Applied **per field set**, not whole document → disjoint edits on different devices both survive.
- Tombstone precedence: newer delete wins.
- **Semantic conflicts** (same field, both edited) are not silently decided: default LWW applies + `conflictFlag` + `conflictOf`; the client shows resolution UI (keep mine / keep theirs / edit) and pushes an explicit resolution.
- Deterministic tiebreak (`updatedAt` → `rev` → `_id`) guarantees convergence.

**Loop prevention:** server only changes `rev`/`updatedAt` on real deltas; clients merge only when incoming rev differs; idle pulls never reschedule themselves.

## Alternatives Considered
- **CRDTs** — mathematically convergent but heavy; overkill for a replace-heavy personal ledger; field semantics handled more simply by LWW+merge.
- **Client-wins** — risks discarding newer edits from another device (silent loss) → rejected.
- **Pure server-wins** — risks silently discarding offline user work (violates user-in-control) → rejected.
- **Dirty-bit last-write-wins** without field merge — simpler but clobbers valid disjoint edits → rejected.

## Trade-offs
- Field-merge + resolution UI is more complex than naive LWW, but directly satisfies "no silent overwrite of valid data."
- Server-verified timestamps require reliable NTP on API (normal for managed infra).
- Eventual consistency (seconds) is accepted and documented to users.

## Consequences
- Transaction/category/etc. schemas include `clientId`, `rev`, `updatedAt`, `deletedAt` + unique indexes from the start (Phase 3).
- Sync endpoints (`/sync/changes|push|bootstrap|state`) implemented in Phase 5 before Android (Phase 6).
- Every later phase (import, OCR, SMS) funnels through the same idempotent, fingerprinted ingestion → duplicates impossible by construction.
- Chaos tests enforce invariants (no dupes, no loss, convergence).
