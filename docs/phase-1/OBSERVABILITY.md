# MoneyTalks — Observability (Phase 1)

> Status: Approved (design only — no implementation in Phase 1).

---

## 1. Objectives

- Know the health and performance of every component in one place.
- Correlate failures across web → API → DB/queue → providers (OCR/AI/email).
- Detect sync pathology (stuck queues, loops, duplicate storms) before users notice.
- Support audit and compliance through immutable, sanitized audit logs.
- Rapid incident triage with `requestId`-anchored traces and logs.

## 2. Pillars (MELT + Audit)

1. **M**etrics — RED + business metrics, dashboards, alerts.
2. **E**vents — structured logs (JSON), sanitized.
3. **L**ogs — same as events; persisted, searchable, retained.
4. **T**races — distributed tracing (OpenTelemetry), spans across API→DB/queue/providers.
5. **Audit logs** — security/accountability trail (separate, append-only).

## 3. Structured Logging

- **pino** (JSON, low overhead), fields: `ts`, `level`, `service`, `requestId`, `userId` (hashed/optional), `traceId`, `spanId`, `method`, `path`, `status`, `durationMs`, `outcome`, sanitized context.
- **Correlation:** `requestId` generated at ingress (web/API/Android request), propagated in responses (`X-Request-Id`) and to downstream calls; `traceId` via OTEL.
- **Sanitization policy:** never log tokens, passwords, refresh-token hashes, raw SMS bodies, full account/UPI refs, receipt image bytes, AI prompts containing PII. Redaction middleware at the logger boundary (keys allowlist/denylist).
- **Android:** local structured logging (per-app files, privacy-safe, opt-in telemetry) — never raw SMS content.

## 4. Request IDs

- One `requestId` per inbound request (web client generates for uploads/jobs, API generates for its own).
- Persisted on error envelopes + audit logs; included in client error reports.
- Sync ops carry `requestId` per push batch; job records store originating `requestId`.

## 5. Error Tracking

- Central error tracker (e.g., Sentry-class) with: stack, requestId, userId (hashed), service/version, environment, breadcrumbs.
- **PII-safe configuration:** no raw SMS, tokens, or financial details captured; denylists enforced.
- Client-side errors (web + Android) captured with the same requestId where available.
- Alerting on error-class rate thresholds, not every instance.

## 6. Sync Logs & Health

Per device/user sync events (structured, sanitized):
- push/pull start/finish, cursor values, op counts, per-op results, retries, backoff level.
- **Alerts:**
  - Queue age > threshold (stuck sync).
  - Retry amplification (same op retried > N) → loop detection.
  - Duplicate-hit rate spike.
  - Conflict rate spike.
- Metrics: `sync.latency`, `sync.ops.push.rate`, `sync.ops.result{applied|duplicate|conflict|rejected}`, `sync.queue.depth`, `sync.conflicts{fieldLevel|semantic}`.

## 7. Audit Logs

- Write-only via the audit service; fields: `userId?`, `actor`, `action`, `targetType/id`, `before/after` (sanitized), `ip`, `userAgent`, `requestId`, `ts`.
- Actions: auth (login/fail/logout/refresh-reuse), password change/reset, device add/revoke, logout-all, account delete/export, transaction create/edit/delete/categorize, import commit, receipt commit/reject, report/export download, backup/restore, AI chat (metadata only), settings change.
- Retention: ~90 days online + archive; append-only storage (immutable bucket/table); access restricted to admins with audit trail of reads.

## 8. Important Metrics

### Service metrics (RED)
- `http.requests.rate`, `http.errors.rate{code,status}`, `http.latency{p50,p95,p99}` per endpoint group.
- `db.latency`, `db.errors`, `db.connections`.
- `queue.depth`, `queue.stale`, `job.success|fail.rate{kind}`, `job.latency{kind}`.
- `provider.{ocr,ai,email,storage}.latency|errors.rate` (adapter labels).

### Business metrics (anonymized/aggregated)
- Registered/active users; verification rate; login success vs failure rate.
- Transaction write rate by source (`manual|sms|import|ocr`); duplicate-hit rate; pending-review backlog.
- Import success/failure rates; OCR success + confidence distributions; AI insight generation rate + engagement.
- Sync health metrics (§6).
- Cost telemetry: AI/OCR per-operation cost aggregates (billing awareness).

## 9. Health Checks

- `GET /health/live` — process alive (no deps).
- `GET /health/ready` — DB, Redis, queue connectivity, storage reachable; returns component status map.
- Orchestrator (K8s/compose) uses liveness/readiness; LB drains unready replicas.
- Providers: health surfaced via adapter status cache; degraded state reported (not fatal).

## 10. Alerting & Dashboards

- Dashboards: API RED, jobs, sync health, provider health, business KPIs, cost.
- Alerts: SLO burn, 5xx rate, p95 latency breach, queue depth, stuck sync, duplicate spike, provider error rate, DB saturation, disk/storage growth.
- Runbooks per alert in-repo (`infra/runbooks/`), reviewed each phase.

## 11. Tracing

- OpenTelemetry instrumentation: middleware spans (http), Mongo client spans, queue worker spans, provider client spans; trace sampling (head-based, e.g., 10–50% adjustable).
- Trace context propagates to async jobs (jobId ↔ traceId).
- Provider traces include latency/status/retry count, never payload content.

## 12. Retention & Cost

- Logs: 30 days hot + 180 days archive (or config); audit 90 days + archive; metrics 30 days + rollups; traces 7 days.
- Managed backends (managed logging/metrics/tracing) to minimize ops; config in `infra/`.

## 13. Non-Goal (Phase 1)

- No observability tooling is installed in Phase 1. This document specifies the contract; implementation begins in Phase 11/12 and increments (basic request logging + health checks start in Phase 2).

## 14. Related Documents

- Error contract: `ERROR_HANDLING.md`
- NFR: `NFR.md` (§9)
- Audit storage: `DATABASE_ARCHITECTURE.md` (§3.14)
