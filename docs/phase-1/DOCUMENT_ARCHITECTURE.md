# MoneyTalks — File / Document Architecture (Phase 1)

> Status: Approved (design only). Covers: receipt images, PDF reports, CSV/Excel imports & exports.

---

## 1. Document Lifecycle (shared)

```
Upload / Generate → Validate → Store (private, encrypted) → Authorize access (signed URL) → Expire/Delete (retention + purge)
```

All documents are **user-scoped**, **private by default**, and served only via short-lived, signed, user-scoped URLs.

---

## 2. Document Types & Their Flows

### 2.1 Receipt images
- **Produced by:** web/Android upload (`POST /receipts`).
- **Stored:** object storage; server-side encrypted; private bucket.
- **Lifecycle:** upload → validate (MIME/magic/size/scan) → OCR job → result in DB → optional link to transaction → delete on user action or retention.
- **Access:** `GET /receipts/:id/image` → signed URL (short TTL, e.g., 5–15 min) scoped to user.

### 2.2 PDF reports (monthly)
- **Produced by:** server-side job (`POST /reports/monthly`) rendering a templated PDF.
- **Stored:** object storage; private.
- **Lifecycle:** job → generate → store → download (signed) → expire (e.g., 30 days) → purge.
- **Access:** `GET /reports/:id/download` → signed URL.

### 2.3 CSV imports
- **Produced by:** user upload (multipart) — bank/UPI/app exports.
- **Stored:** object storage temporarily (until import committed/aborted), then **deleted** (data lives on in transactions; raw file not retained beyond job + short grace period).
- **Lifecycle:** upload → validate → parse job → preview → user mapping → commit → delete file.

### 2.4 Excel imports
- Same as CSV imports (`.xlsx`; `.xls` rejected or converted — see validation).

### 2.5 CSV / Excel exports
- **Produced by:** export job (`POST /exports`).
- **Stored:** object storage; private; signed download.
- **Lifecycle:** generate → store → download (signed) → expire (e.g., 7 days) → purge.

---

## 3. File Naming

- **Server-generated, opaque, collision-free names.** User filenames are never used for storage keys.
- Pattern: `<entity>/<userId-hash>/<uuid>.<ext>` where `<ext>` re-derived from validated content (never from upload name).
- Examples:
  - `receipts/ab12cd…/5f8c…a1.jpeg`
  - `reports/ab12cd…/a3b4….pdf`
  - `exports/ab12cd…/c9d0….xlsx`
  - `imports/ab12cd…/e7f8….csv`
- Human-friendly name only in metadata (sanitized, truncated, ASCII-safe) for display; Content-Disposition uses a clean download name.
- Benefits: no path traversal, no injection, no user-controlled key names, easy lifecycle rules by prefix.

## 4. Storage

- **Object storage** (S3-compatible / GCS / Azure Blob) chosen for: managed durability, encryption at rest, signed URLs, lifecycle policies, cost scaling.
- **Server-side encryption (SSE)** at rest; TLS in transit.
- **No public buckets.** Default deny; per-object access via signed URLs validated against ownership in the API (download endpoints re-verify `userId`).

## 5. Validation

| Type | Checks |
|---|---|
| Receipts | MIME allowlist (`jpeg/png/webp/heic`), magic-byte verification, size ≤ 10 MB, dimension sanity; AV scan; quarantine on flag |
| Imports | MIME allowlist (`text/csv`, `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`), magic bytes, size ≤ 20 MB, row count cap (e.g., 100k), column header validation on parse |
| Exports | Range/filters validated before generation; size guard on generation (paged streaming if huge) |
| PDFs | Internal generation only (no user upload); checksummed |

- Magic-byte sniffing is authoritative; declared Content-Type is cross-checked; extension is re-derived server-side.
- Unsupported formats → `415`; over-limit → `413`; malformed content → per-row/`422` reporting (imports), not whole-file failure.

## 6. MIME & Content-Type Policy

- Allowlists per entity (above).
- Responses served with correct, fixed Content-Type + `Content-Disposition: attachment; filename="…"` for downloads (never inline-execute).
- HTML/SVG/MIME-smuggling variants explicitly rejected; images re-encoded server-side for OCR where beneficial (strips embedded payloads).

## 7. Security

- **Access control:** every download/URL is authorized in API (user scoping) then short-lived signed URL. Signed URL alone is not sufficient — API re-checks owner.
- **No execution:** uploaded files are never executed or server-rendered; images processed by OCR only; no user-controlled HTML/JS.
- **Path traversal/injection:** opaque server keys (§3); sanitized display names; parameterized operations only.
- **Malware:** AV scan on upload (quarantine on flag); block further processing.
- **Encryption:** SSE at rest; TLS in transit; backups of bundles are user-key encrypted additionally.

## 8. Cleanup

- **Lifecycle rules** on object storage prefixes (auto-expire: exports 7d, reports 30d, imports after commit/abort + grace).
- **Application purge jobs** also remove DB metadata (`exports`/`reports`/`receipts` rows beyond retention) and any orphaned objects (scan + delete > age threshold).
- On **account deletion**: scheduled job deletes all objects owned by user (receipts, reports, exports, imports, backups) + DB rows (after export grace if user requested data export).

## 9. Retention Strategy

| Document | Online (signed download) | Raw storage | Purge |
|---|---|---|---|
| Receipt images | Until user deletion | Until user deletion or account deletion | On user delete / account delete |
| Import files | Until commit/abort | Grace 24h after commit | Deleted after grace |
| Export files | 7 days | 7 days | Auto-lifecycle |
| PDF reports | 30 days | 30 days | Auto-lifecycle |
| Cloud backups | Until replaced/removed | Retention window (e.g., 60 days, configurable) | Auto-lifecycle |
| Audit/raw SMS (local) | — | Per user setting (Android local) | Local-only policy |

- All retention values are **config-driven** (`app_settings`), single source of truth.
- Purge is idempotent + audited.

## 10. Size & Quota Governance

- Per-file limits (above) + per-user storage caps (receipts) enforced at upload; caps configurable.
- Over-quota → `413` with clear message + link to clean up.

## 11. Error Handling (summary)

- `413` size, `415` MIME/type, `422` content, `404` missing, `410` expired, `429` quota.
- Import per-row errors are reported as a structured report (row index, field, reason, suggested fix), not fatal.
- Full matrix: `ERROR_HANDLING.md`.

## 12. Related Documents

- Endpoints: `API_ARCHITECTURE.md` (§2.10–2.12)
- OCR storage specifics: `OCR_ARCHITECTURE.md`
- Upload security: `SECURITY_ARCHITECTURE.md`
