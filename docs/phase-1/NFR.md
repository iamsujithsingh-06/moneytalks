# MoneyTalks — Non-Functional Requirements (Phase 1)

> Status: Approved targets. Measurable, testable, and revisit-able each phase.

---

## 1. Performance

| Metric | Target |
|---|---|
| API core endpoints (auth, txn create/list, budget) | p95 < 300 ms server-side (excluding DB cold cache) |
| Dashboard summary | p95 < 500 ms server-side; client renders < 1 s on mid-tier hardware |
| Analytics queries (30-day, typical user) | p95 < 1 s |
| Search (text) over typical ledger | p95 < 500 ms |
| Sync push (100-op batch) | p95 < 2 s round trip |
| Import parse (10k rows) | < 30 s end-to-end (async job) |
| OCR receipt (cloud) | p95 < 30 s job latency (async, surfaced as progress) |
| Web initial load | LCP < 2.5 s (good), CLS < 0.1 |
| File upload throughput | accepts at network speed; no blocking of UI |

## 2. Availability

- API monthly uptime target: **99.5%** (≈ 3.6 h/month downtime budget).
- Database: Atlas SLA-tier chosen accordingly; replicas for failover.
- Degradation: if external provider (OCR/AI) fails, core ledger features remain available (graceful degradation).
- Maintenance: zero-downtime deploys (rolling), DB migrations additive-first.

## 3. Scalability

- Designed for horizontal scaling of stateless API replicas behind LB.
- Writes scoped per-user (Mongo sharding ready if a user base demands).
- Async job capacity scales with queue workers.
- Target: 1k concurrent API requests without degradation; architecture must support 10k+ with replica/DB tiering (no redesign).

## 4. Security

- TLS 1.2+ everywhere; HSTS; secure headers.
- Argon2id password hashing; JWT + rotating refresh tokens.
- Input validation on every boundary (Zod).
- User data isolation enforced at service + repository layers.
- No raw passwords, no biometric data, no secrets in logs/clients.
- Rate limiting (auth strict, writes moderate).
- Secure file handling (magic-byte MIME, size caps, AV scan, private storage, signed URLs).
- Annual security review + dependency vulnerability scanning in CI.
- OWASP Top 10 addressed (see SECURITY_ARCHITECTURE threat model).

## 5. Privacy

- Data minimization: raw SMS local-only; extracted fields only to server; consent-driven.
- User can export and delete data (right to erasure) within defined SLA (e.g., export ready ≤ 24 h; deletion scheduled ≤ 30 days with grace).
- Cloud backup is opt-in + user-key encrypted.
- External providers (OCR/AI/email): DPAs, data-residency options, retention/deletion, disclosure in privacy policy.
- No third-party trackers/analytics without consent.

## 6. Reliability

- No data loss in offline→sync transitions (tested invariant).
- Idempotent writes; duplicate prevention; tombstones for deletes.
- Retry with exponential backoff + jitter; DLQ for permanent failures.
- Backup/restore verified (periodic restore drills).
- Graceful degradation documented for every external dependency.

## 7. Maintainability

- Monorepo with shared contracts; vertical slices; provider adapters.
- 100% coverage of service-layer business rules; ≥80% line coverage overall (configurable, Phase 2 target).
- CI gates: typecheck, lint, tests, contract checks, build.
- Linting/formatting enforced; migrations versioned; docs kept in-repo.
- Onboarding: a new developer goes from checkout to running dev stack from README in < 1 hour.

## 8. Accessibility (Web)

- WCAG 2.1 AA for web (contrast, keyboard, focus, labels, reduced motion).
- Touch targets ≥ 44 px; text can scale; charts provide accessible data alternatives.
- Android: TalkBack support on primary flows; system font scaling honored.

## 9. Observability

- Structured JSON logs with request IDs (correlation across services).
- Metrics (RED: rate/errors/duration) + custom business metrics; dashboards + alerts.
- Error tracking with context (no PII).
- Health checks (`/health` liveness + readiness) wired into orchestrator.
- Audit logs for security-relevant events.
- Sync logs/metrics to detect stuck queues/loops.
- See `OBSERVABILITY.md`.

## 10. Error Handling

- Standardized error envelope; categorized (validation/auth/not-found/conflict/rate-limit/upstream/unknown).
- User-facing messages are actionable and safe (no internals); developer-facing detail gated (non-prod).
- Idempotent retries; graceful client handling.
- See `ERROR_HANDLING.md`.

## 11. Data Integrity

- Money as integer minor units + currency (no float).
- Server-authoritative clocks for `updatedAt`/`rev`; deterministic conflict resolution.
- Unique indexes for idempotency + fingerprints.
- Referential integrity by service layer + checks (category type match, currency consistency).
- Backups checksummed; retention enforced by lifecycle + purge jobs.

## 12. Offline Reliability

- Local writes atomic with queue writes.
- App restarts/OS kills never corrupt the queue (ACID Room).
- Convergence guarantee with quiescence + connectivity (tested).
- No duplicates on reconnect/double-tap/retry (idempotency).
- Sync failures surfaced, never silent.

## 13. Compliance & Legal (Direction)

- Privacy policy + terms; SMS/data consent flows documented; Play Store SMS policy compliance.
- GDPR-style data rights (export/delete) honored; DPAs with providers.
- Retention schedules documented (DOCUMENT_ARCHITECTURE).
- Final counsel review before public launch (Phase 11/12).

## 14. NFR Verification Approach

- Performance/load: k6 benchmarks in CI + staged load tests.
- Availability: SLO dashboards + alerting; incident runbooks.
- Security: dependency scans, SAST, review checklist, pen test before launch.
- Reliability: chaos tests (kill DB/queue/network) in staging; restore drills.
- Accessibility: automated (axe) + manual audits.
- Offline: integration test matrix for offline→sync scenarios.
