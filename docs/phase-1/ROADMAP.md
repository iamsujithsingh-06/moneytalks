# MoneyTalks — Roadmap (Phase 1)

> Status: Approved. Phases are ordered for dependency safety: foundations before features, sync before mobile, review-before-automation.

---

## Phase 1 — Product + Architecture ✅ (this phase)
- All architecture, product, and decision documents in `docs/phase-1/`.
- Success criteria: another developer can implement without redesign.

## Phase 2 — Backend Foundation + Authentication
- Monorepo scaffolding (pnpm workspaces, shared packages, lint/type/test config, CI).
- API bootstrap: Express, middleware (request-id, logging, error envelope, rate-limit), Zod validation, config from env (Zod).
- MongoDB Atlas connection + Mongoose schemas/indexes for `users`, `devices`, `audit_logs`, `app_settings`, `feature_flags`.
- Auth: register, verify-email, login, refresh (rotation + reuse detection), logout, logout-all, forgot/reset password, devices.
- Argon2id hashing; token storage; audit logging for auth events.
- Health checks + basic structured logging.
- **Exit:** full auth flows + devices work end-to-end with tests.

## Phase 3 — Core Transaction Management
- Categories (defaults + CRUD), payment methods.
- Transactions: create (all 5 types), read/list/search/filter, edit, soft-delete; duplicate fingerprints + detection.
- Confirm/reject pending drafts; categorization (manual + rule-based).
- Idempotency headers; validation + error contract for all transaction endpoints.
- **Exit:** a correct, isolated, duplicate-safe ledger via API + tests.

## Phase 4 — Dashboard, Analytics, Budgets, Goals
- Analytics service (periods, breakdowns, trends, deltas, anomalies) + endpoint group.
- Dashboard summary endpoint.
- Budgets (create/track/alerts) + savings goals.
- Web UI foundations: design tokens, layout, dashboard, transactions list, analytics charts (Recharts).
- Derived-aggregate decision gate (aggregation vs bucket collection) based on measured latency.
- **Exit:** users can add/edit/view transactions and see meaningful analytics + budgets on web.

## Phase 5 — Offline-First + Synchronization
- Sync protocol endpoints (`changes`, `push`, `bootstrap`, `state`); cursors + tombstones + `rev`.
- Conflict resolution (LWW-SV + field-merge + semantic resolution); idempotency at scale.
- Web offline snapshot (IndexedDB) + sync engine; sync UI states.
- Reliability/chaos tests for sync invariants (no dupes, no loss, convergence).
- **Exit:** offline transactions sync across devices correctly.

## Phase 6 — Android Companion + SMS Detection
- Android app scaffold (Compose, Hilt, Room, Keystore, sync engine wiring).
- Auth + app lock (PIN + biometric) + encrypted local storage.
- SMS pipeline: receiver, parser (rule sets + corpus), normalizer, classifier, dedupe, drafts, review UI.
- Sync integration for confirmed transactions; permissions/consent flows.
- **Exit:** detected SMS transactions reach the ledger after review, with no duplicates.

## Phase 7 — Import/Export + PDF Reports
- Import pipeline (CSV/XLSX parse, mapping, preview, commit, row errors, dedupe).
- Export jobs (CSV/XLSX) + downloads; retention/expiry.
- Monthly PDF report generation (templated) + download.
- Web UI for import/export/reports.
- **Exit:** data round-trips cleanly (import → ledger → export/PDF) without dupes.

## Phase 8 — Receipt Upload + OCR
- Receipt upload/validation/storage; OCR orchestration job; confidence + review; commit/reject; provenance on transactions.
- Web + Android receipt capture UI; auto-commit opt-in (high confidence only).
- **Exit:** receipts become reviewed transactions with full provenance.

## Phase 9 — Security Hardening + Multi-Device Polish
- Full device management UX; logout-all; session/security audit viewer.
- Web app-lock (session) if adopted; Android hardening (SQLCipher, FLAG_SECURE, capture protection).
- Rate-limit tuning; brute-force protections; account erasure + export UX.
- Pen-test/SAST pass; vulnerability remediation.
- **Exit:** security review gates passed.

## Phase 10 — AI Financial Assistant
- Intent detection + FinancialDataService (grounded analytics).
- Prompt assembly + provider adapters + failover; response references + drill-downs.
- Insights engine (deterministic signals + grounded generation) + insight cards + feedback.
- Opt-in controls, cost caps, hallucination tests.
- **Exit:** grounded assistant + insights with traceable numbers.

## Phase 11 — Testing + Production Hardening
- Full test matrix (unit/service/integration/e2e), chaos tests, load tests (k6), accessibility audits.
- Schema/API stability review; migration toolkit; backup/restore drills.
- Docs for runbooks, privacy policy, terms; provider DPA review.
- **Exit:** release candidate.

## Phase 12 — Deployment + Monitoring
- IaC for prod (Atlas, object storage, queue, LB, DNS, WAF, TLS/HSTS), CI/CD pipelines.
- Observability rollout (logs/metrics/traces/dashboards/alerts/audit), SLO dashboards.
- Canary/rolling deploys, feature flags, incident response, monitoring on-call.
- **Exit:** production launch + monitored operations.

---

## Adjustments vs the suggested sequence (rationale)

- **Sync (P5) before Android (P6):** the Android app is an offline-first client; it needs the sync protocol first.
- **Web UI foundations (P4) before offline (P5):** establishes the design system + dashboard before offline complexity.
- **Security hardening (P9) after core features, before AI:** AI must never land on a weak foundation; hardening precedes the highest-risk feature.
- **AI (P10) last among features:** it depends on analytics (P4), sync quality (P5), and data quality (P3/P6–P8).
- **Deployment (P12) after hardening + testing (P11):** standard production order.

## Cross-phase invariants to preserve

- No duplicates, no data loss, convergence (P5 tests every later phase).
- Money always integer minor units; validation on every boundary.
- AI grounded; OCR/SMS always review-gated (unless explicit opt-in + high confidence).
- User isolation + audit from P2 onward.
