# MoneyTalks — OCR Architecture (Phase 1)

> Status: Approved (design only). Reference: `adr/ADR-006-ocr.md`.
> **Hard rule:** OCR output must NOT automatically create a final financial transaction without validation/review, unless confidence is sufficiently high AND the user has explicitly enabled auto-commit behavior.

---

## 1. Pipeline Overview

```
Receipt image (web/Android upload)
   │
   ▼
Upload (validation: MIME/magic bytes, size, scan)
   │
   ▼
Secure storage (encrypted object storage, private)
   │
   ▼
OCR job (async, adapter-isolated provider)  → OCRProvider interface
   │
   ▼
Extracted raw fields (provider-specific)
   │
   ▼
Normalization (canonical draft transaction + per-field confidence)
   │
   ▼
Duplicate detection (vs ledger + drafts)
   │
   ▼
User review (confirm/edit/reject)          → (auto-commit path gated below)
   │
   ▼
Transaction creation (source=ocr, receiptId, ocrConfidence)
```

---

## 2. Upload & Validation

- Endpoint: `POST /receipts` (multipart). Web and Android use the same API.
- Validation:
  - Allowed MIME: `image/jpeg`, `image/png`, `image/webp`, `image/heic` (transcoded server-side as needed for OCR).
  - Magic-byte verification (not just extension); content-type header cross-checked.
  - Size limit (e.g., ≤ 10 MB); image dimension limits (downscale > 4000 px to OCR-friendly size).
  - Malware/AV scan on upload; quarantine on flag.
- Storage: object storage, server-side encrypted, private; access via short-lived signed URLs scoped to the owning user.

## 3. OCR Processing (provider-agnostic)

- **`OcrProvider` interface:** `extract(imageRef) → { rawFields, providerMetadata, providerJobId }`.
- Reference implementation: cloud Document AI / Textract / Azure Document Intelligence (chosen at implementation by evaluation — accuracy on Indian/receipt layouts, cost, latency, data residency). On-device ML Kit extraction is a complementary fast path for Android (partial fields) but cloud OCR remains the accuracy path for complex receipts.
- Async: job queued (BullMQ/cloud queue); status surfaced via `GET /receipts/:id`.
- Retry: transient provider errors retried with exponential backoff; DLQ for persistent failures.
- Caching: receipts hashed (`sha256`); identical image re-submissions reuse results where allowed (privacy/permission permitting).

## 4. Extracted Fields → Normalized Draft

| Raw (provider) | Normalized (draft) | Confidence |
|---|---|---|
| Merchant/company name | `merchant` | per-field |
| Line items (name + price) | `items[]` | per-item |
| Subtotal/tax | `taxMinor`, `subtotalMinor` | per-field |
| Total | `amountMinor`, `currency` | per-field |
| Date | `transactionDate` | per-field |
| Payment method text (UPI/card/cash) | `paymentMethodHint` | per-field |
| Currency symbol | `currency` | — |

- Normalization: amount → minor units (locale-aware parse), date → ISO, merchant cleanup, currency detection.
- **Overall confidence** = weighted aggregate of field confidences (weights: amount/total highest, then date, then merchant).
- Draft is always typed `expense` unless the receipt clearly indicates otherwise (refund/credit memo → `refund`).

## 5. Confidence Handling (Mandatory)

- **Per-field confidence** and **overall confidence** (`0..1`) stored on the receipt record and surfaced in the review UI (e.g., highlighted "needs review" chips).
- **Review gates:**
  - `overall < REVIEW_THRESHOLD` (e.g., 0.6) → **must review**; cannot commit without explicit user confirmation of the risky fields.
  - `REVIEW_THRESHOLD ≤ overall < AUTOCOMMIT_THRESHOLD` (e.g., 0.9) → review required (confirm/edit), auto-commit disabled.
  - `overall ≥ AUTOCOMMIT_THRESHOLD` (0.9) **AND** user has enabled `receiptAutoCommit` (explicit opt-in) **AND** no duplicate detected → auto-create as **pending-review** transaction (status `pending`, clearly reversible; user can reject). Even auto-committed items appear in review queue until accepted.
- **Reject path:** low confidence or user rejection → draft discarded (`status=rejected`), no transaction created.
- **Missing fields:** absent amount/date → cannot auto-commit; user must fill.

## 6. Duplicate Detection

- Fingerprints: `sha256` of receipt image; `(merchant, amountMinor, transactionDate)` against ledger + drafts within window.
- On match: surface "already exists" with link; prevent duplicate transaction creation.

## 7. User Review → Transaction Creation

- `POST /receipts/:id/commit` with optional overrides → validates draft, applies overrides, runs final duplicate check, creates transaction (`source=ocr`, `receiptId`, `ocrConfidence`, `status=confirmed` by user action, or `pending` when auto-committed).
- Transaction provenance (`ocrRef`) retains field confidence; the receipt record links `linkedTransactionId`.
- User can also attach a receipt to an existing transaction (link-only, no new transaction).

## 8. Storage & Retention

- Image lifecycle managed by `DOCUMENT_ARCHITECTURE.md` (naming, encryption, signed URLs, retention ~ user-deletion + retention window, purge job).
- User deletion of transaction → option to delete linked receipt image too (default on).

## 9. Privacy & Security

- Consent at upload (what is sent to the OCR provider, retention, deletion).
- Encrypted in transit + at rest; private access; no public URLs.
- Provider terms reviewed for data use; where required, provider data-residency option selected.
- Receipt images never shown to AI assistant context (no cross-feature data bleed).

## 10. Edge Cases

| Case | Behavior |
|---|---|
| Unreadable/blurry image | Low confidence; must-review; never auto-commit |
| Multi-page/duplicate merchant | Take first/total match; flag for review |
| No total field | Draft lacks amount → cannot commit without user input |
| Provider outage | Job retries/backoff; user sees "processing" state; no data loss |
| Receipt in foreign currency | Currency detected; draft marked multi-currency (Phase 1 single-currency convert on confirm or warn) |
| Duplicate receipt upload | Fingerprint match → linked, no re-processing cost |
| Malicious/flagged file | Quarantined; no OCR; user notified |

## 11. Metrics (observability)

- Upload-to-result latency p50/p95; OCR success rate; field confidence distributions; auto-commit rate; review acceptance rate; duplicate-hit rate; provider error rate.
- See `OBSERVABILITY.md`.

## 12. Related Documents

- Endpoints: `API_ARCHITECTURE.md` (§2.12)
- File handling: `DOCUMENT_ARCHITECTURE.md`
- Decision: `adr/ADR-006-ocr.md`
