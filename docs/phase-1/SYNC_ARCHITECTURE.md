# MoneyTalks — Offline-First + Sync Architecture (Phase 1)

> Status: Approved (design only). Critical requirement. Reference: `adr/ADR-004-offline-sync.md`.

---

## 1. Goals & Non-Negotiable Invariants

The system must **never**:
- produce duplicate transactions from re-sync, retries, or multi-device interleaving;
- lose data created offline;
- loop infinitely (sync must converge);
- silently overwrite conflicting valid data.

**Convergence guarantee:** given quiescence (no new writes) and connectivity, all devices converge to the identical canonical ledger state.

---

## 2. End-to-End Flow (numbered as required)

1. **User creates transaction while offline** — client writes to local store.
2. **Transaction is stored locally** — in Room (Android) / IndexedDB (web snapshot) as a full entity.
3. **Transaction receives a local identifier** — `clientId` (UUID v4) generated at creation.
4. **Sync queue records pending operation** — a `CREATE` op with `idempotencyKey == clientId` is appended **atomically** with the local write (same DB transaction).
5. **Internet becomes available** — trigger: connectivity callback / WorkManager / app foreground / manual pull-to-refresh.
6. **Client synchronizes with backend** — pull changes (`GET /sync/changes`) then push ops (`POST /sync/push`).
7. **Backend validates and stores transaction** — validates schema, dedupes by clientId/idempotency, applies conflict rules, bumps `rev`.
8. **Client receives canonical server state** — server returns canonical entity (server `_id`, `updatedAt`, `rev`).
9. **Sync status is updated** — client stores canonical state, clears the op from the queue, sets `syncState=synced`.

---

## 3. Core Concepts

### 3.1 Client IDs (`clientId`)
- Every mutable entity created on a client gets a UUID `clientId` **before** any network call.
- `clientId` is permanent for the entity's life; it is the idempotency anchor for creates.
- DB: unique index `{userId, clientId}` per entity → the server can upsert safely.

### 3.2 Server IDs (`_id`)
- MongoDB ObjectId assigned on server persist.
- Clients keep both: `clientId` (their anchor) and server `_id` (canonical reference) once known.

### 3.3 Sync Queue
- Per-device, per-entity op queue, ordered.
- Op shape: `{entity, op: CREATE|UPDATE|DELETE|CONFIRM|REJECT, clientId, payload, idempotencyKey, createdAt, attempt, status: pending|inFlight|done|failed}`.
- Stored in the local DB; **atomic** with the data change that produced it (ACID in Room).
- Ops are immutable once created (payload frozen) to guarantee deterministic replay.

### 3.4 Idempotency
- **Creates:** `idempotencyKey = clientId` → server upsert by `{userId, clientId}` returns existing doc; no dupes.
- **All other ops:** client sends `Idempotency-Key` header (UUID) per op; server stores hashed key `(userId, entity, key)` for 24h and replays the recorded response for duplicates.
- Server never blindly inserts; it always checks first (unique indexes as belt-and-braces).

### 3.5 Retry Strategy & Exponential Backoff
- Transient failures (5xx, network, 429): retry with **exponential backoff + jitter** (e.g., 1s → 2s → 4s … cap 5 min), retry count + attempt recorded.
- Permanent failures (4xx validation, auth): surface to user, do not auto-retry; op stays `failed` with reason.
- Idempotency makes retries safe.
- On 401: refresh tokens → re-login flow; resume queue after re-auth.
- Max attempts → Dead-letter review (op `failed`, user-visible "pending sync" badge with details).

### 3.6 Conflict Detection
- Server tracks `rev` (increments on every write) and `updatedAt` (server clock).
- Push payload carries the client's `baseRev` (the rev the client based its change on).
- On server apply:
  - If `payload.baseRev == current.rev` → **clean apply**, no conflict.
  - If `payload.baseRev < current.rev` → **conflict** (someone else changed it after the client's base).
- Deletes use tombstones: `deletedAt` set, record retained for retention window.

### 3.7 Conflict Resolution Strategy — **LWW-SV (Last-Writer-Wins with Server-Verified timestamps) + user-aware semantic conflicts**

Chosen policy:
1. **Primary rule — last-writer-wins on `updatedAt`** with the server's authoritative clock at apply time (not client clock), applied per **field set**, not whole document, to minimize clobbering.
2. **Field-level merge:** fields only touched by the client are merged against fields only touched by the other writer; both-win fields are kept (e.g., user edits `merchant` offline while another device edits `note` → both preserved).
3. **Tombstone precedence:** a newer delete always wins over an older update.
4. **Semantic conflicts** (true ambiguity: same field, different values, both edited since common base) are **not silently decided**: server applies LWW default and marks the entity `conflictFlag=true` + `conflictOf`; client shows the resolution UI (keep mine / keep theirs / edit) and pushes an explicit resolution (new update) which clears the flag.
5. **Deterministic tiebreak:** identical `updatedAt` broken by `rev`, then by `_id` lexicographic — guarantees convergence.

Why this strategy:
- Offline-first personal finance has low write contention; most conflicts are trivially field-disjoint.
- Field-level merge preserves user work (prevents "silent overwrite of valid data").
- Explicit user resolution for genuine conflicts respects the user-in-control principle (no silent data loss).
- Server-verified timestamps prevent client clock manipulation from corrupting the ledger.
- Alternatives rejected: pure client-wins (risk losing newer edits), pure server-wins (risk silently discarding offline user work), CRDTs (high complexity; ledger is append/replace heavy and field semantics are simpler with LWW+merge). Documented in ADR-004.

### 3.8 Delete Synchronization
- Delete = soft delete with `deletedAt` + `rev` bump.
- Tombstone retained ≥ retention window (e.g., 60 days) so any device passing the deletion cursor cannot resurrect the entity; after retention, hard-purge + fingerprint deactivation.
- Offline delete → `DELETE` op pushed; server marks tombstone if client is authorized owner.
- Recreate of a deleted entity = new `clientId` + new fingerprint (allowed); not a conflict.

### 3.9 Update Synchronization
- `UPDATE` ops carry changed fields + `baseRev`.
- Server applies field-merge LWW per §3.7; bumps `rev`; returns canonical doc.
- Clients merge canonical into local store (canonical `rev`/`updatedAt` win for the fields they didn't touch; their own offline edits for fields they did touch are pushed, not discarded).

### 3.10 Duplicate Prevention (sync-specific)
- Creates deduped via `{userId, clientId}`.
- Content-level duplicates deduped via `duplicate_fingerprints` (§6 of DATABASE_ARCHITECTURE) — a retried push or an SMS double-scan cannot insert twice.
- Import rows, OCR drafts, and SMS drafts share the same fingerprint pipeline server-side.

### 3.11 Multi-Device Synchronization
- Each device has its own cursor (`sync_records`) and queue; sync is **pull-then-push** per device.
- A change on Device A reaches Device B on B's next pull (no cross-device push needed).
- All conflict rules are deterministic and server-side → convergence regardless of device count.
- Bootstrap: `GET /sync/bootstrap` returns baseline snapshot (bounded pages) for new device; cursor set to snapshot watermark.

### 3.12 Infinite Sync Loop Prevention
- Server never echoes a change that doesn't bump `rev`/`updatedAt`; clients only enqueue when they create a real delta.
- Applied ops produce canonical docs that, when pulled by the same device, are byte-equal → no re-enqueue (idempotent local merge: only update if incoming `rev`/`updatedAt` differs).
- Cursor advances monotonically; a pull that returns nothing doesn't schedule itself again (idle until write or timer).
- Confirmation/rejection states are first-class fields with their own rev — no reconciliation loops.

---

## 4. Sync Protocol (contract)

### 4.1 Pull — `GET /sync/changes`
- Query: `cursor`, `entities[]`, `limit`.
- Response: `{ itemsByEntity: { [entity]: Change[] }, nextCursor, hasMore }`.
- `Change = { id, clientId?, rev, updatedAt, deletedAt?, payload }` — payload is the canonical entity (or tombstone marker for deletes).
- Server order: by `updatedAt` asc (monotonic per entity); cursor = last processed `updatedAt` (opaque).

### 4.2 Push — `POST /sync/push`
- Body: `{ deviceId, ops: [ { entity, op, clientId, baseRev?, payload, idempotencyKey } ] }`.
- Response: `{ results: [ { status: 'applied'|'duplicate'|'conflict'|'rejected', id?, canonical?, conflict? } ] }`.
- Server processes ops **sequentially per user** (single-writer per user for a given entity id) to avoid races; batch chunking (≤ 100 ops) for payload limits.

### 4.3 Bootstrap — `GET /sync/bootstrap`
- Returns baseline for categories/payment methods (small) then paged transactions; used on first login per device.

---

## 5. Local Merge Rules (client)

- Incoming server doc replaces local doc **iff** server `(rev, updatedAt)` is newer for the same `clientId`/`_id`, **or** server carries fields the client hasn't locally modified.
- Local pending edits (fields modified since last sync, per-field dirty tracking) are preserved and re-pushed.
- Entities still in queue (`pending`) are never overwritten by incoming data for their dirty fields.

## 6. Sync States (client)

- `synced` — canonical, no pending ops.
- `pending` — has queued ops not yet pushed.
- `syncing` — ops in flight.
- `failed` — permanent failure awaiting user action.
- `conflict` — needs user resolution.
- UI badge per state; review queue surface lists failed/conflict items with evidence.

## 7. Cursor & Bootstrap Failure Recovery

- Corruption of local queue: rebuild from server baseline (bootstrap) after explicit user confirmation; lost-only-pending data is re-fingerprinted server-side (idempotency prevents dupes).
- Server schema bump: client `data/schemaVersion` gated — client must upgrade before sync resumes (blocks stale clients from writing incompatible shapes).

## 8. Edge Cases

| Case | Behavior |
|---|---|
| Same txn created offline on 2 devices (same clientId collision — impossible, UUID) | No collision by construction |
| Same content created on 2 devices offline (different clientIds) | Fingerprint detects on second push → `duplicate` result, second device gets canonical first + link |
| Edit offline while another device deletes | Delete is newer → tombstone wins; client's edit becomes no-op with notice; user can recreate |
| Delete offline while another device edits | Edit is older → tombstone wins; device's queue clears |
| Both offline, both edit same field | Field-level conflict → LWW default + `conflictFlag` → user resolution |
| Retry storm after outage | Exponential backoff + jitter + idempotency |
| Client clock wrong | Server timestamps authoritative for LWW; transactionDate is a business field, distinct from updatedAt |
| Huge backlog | Chunked push/pull, resume cursor, progress surface |
| Provider/DB partial failure | Idempotent replay; per-op results; DLQ for jobs |

## 9. Consistency Model

- **Eventual consistency** across devices (seconds). Strong consistency is not required for a personal ledger and would cost availability offline.
- **Read-your-writes:** satisfied within one device immediately; cross-device after next sync (documented UX: "synced" indicators).
- Server writes are atomic per document; analytics recompute is eventually consistent (queued) — bounded to seconds and acceptable (see NFR).

## 10. Related Documents

- Data model/cursors/tombstones: `DATABASE_ARCHITECTURE.md` (§7)
- Endpoints: `API_ARCHITECTURE.md` (§2.14)
- Offline-first user flow: `USER_FLOWS.md` (flows 25–27)
- Decision & rationale: `adr/ADR-004-offline-sync.md`
