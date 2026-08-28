# ADR-006: OCR Architecture

- **Status:** Accepted
- **Date:** Phase 1
- **Related:** `OCR_ARCHITECTURE.md`, `DOCUMENT_ARCHITECTURE.md`

## Context
Receipt upload must produce accurate transactions with provenance and confidence, never auto-create phantom transactions, protect images, and avoid vendor lock-in. OCR must be async (not block requests) and support user review.

## Decision
- **Upload → secure storage → async OCR job → normalize → dedupe → review → transaction creation.**
- **Provider-agnostic:** `OcrProvider` interface (extract → raw fields); reference implementation is a major cloud Document AI service (Google Cloud Document AI / AWS Textract / Azure Document Intelligence) chosen at implementation by evaluation (Indian/receipt accuracy, cost, latency, data residency). ML Kit on-device is a complementary fast path on Android; cloud remains the accuracy path.
- **Async job model:** queue (BullMQ/cloud), status via receipt/job endpoints, retry with backoff + DLQ.
- **Normalization:** raw → canonical draft (merchant, amountMinor, date, items, tax, total, payment method) with **per-field confidence** and overall confidence.
- **Review gates (mandatory):**
  - overall < REVIEW_THRESHOLD → must review; never commits alone.
  - REVIEW ≤ overall < AUTOCOMMIT_THRESHOLD → review required.
  - overall ≥ AUTOCOMMIT_THRESHOLD **AND** user explicitly enabled `receiptAutoCommit` **AND** no duplicate → auto-create as `pending` (reversible, still visible in review queue).
  - Missing amount/date → cannot auto-commit.
- **Dedupe:** image `sha256` + `(merchant, amount, date)` fingerprints against ledger/drafts.
- **Security:** MIME magic-byte + size limits + AV scan; private encrypted storage; short-lived signed URLs; user-scoped; retention/deletion on user action.
- **Provenance:** transaction carries `receiptId` + `ocrConfidence`; receipt links `linkedTransactionId`.

## Alternatives Considered
- Tesseract/self-hosted OCR — free but markedly weaker on noisy receipts; rejected as primary.
- Provider SDK used directly everywhere — couples to vendor → rejected (adapter requirement).
- Client-only OCR (Vision/ML Kit only) — good for privacy/latency but insufficient accuracy on complex receipts; used as supplement, not sole path.
- Rule "high confidence auto-commits by default" — violates locked requirement (explicit opt-in + sufficiently high confidence only) → not adopted.

## Trade-offs
- Cloud OCR sends receipt images to a third party → consent, DPAs, data-minimization, retention/deletion, residency options documented in the privacy flow.
- Async job infrastructure adds a queue dependency → buys non-blocking UX + retryability.
- Adapter adds indirection → small cost vs lock-in avoidance.

## Consequences
- Receipts collection + job model exist before Phase 8 implementation.
- Confidence thresholds are config-driven (`app_settings`).
- Upload/validation/storage rules defined in DOCUMENT_ARCHITECTURE apply.
- OCR never silently creates confirmed transactions (only pending w/ review or explicit user commit).
