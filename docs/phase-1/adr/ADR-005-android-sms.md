# ADR-005: Android SMS Transaction Detection

- **Status:** Accepted
- **Date:** Phase 1
- **Related:** `SMS_TRANSACTION_ARCHITECTURE.md`

## Context
The Android companion must automatically detect income/expense from bank/UPI SMS across many formats, run offline-first, respect privacy, and never create duplicates. No assumption of a public GPay transaction-history API (locked rule): the mechanism is supported Android SMS/notification APIs + user-granted permissions.

## Decision
- **Native Android (Kotlin)** app with a **rule-based, versioned, multi-bank parser** behind interfaces (receiver → detect → parse → normalize → classify → dedupe → draft → review → sync).
- **Capture paths:** `RECEIVE_SMS` broadcast (with consent + Play justification), optional `READ_SMS` backlog scan (explicit, capped), and notification/SMS-Retriever paths where available. All optional, revocable, with rationale screens.
- **Parser:** rule sets keyed by `(bank, formatVersion)` using regex + extractors; confidence per field; versioned with a sanitized test corpus. Unknown formats fall back to a generic parser or are skipped silently. No crash paths.
- **Local-first privacy:** raw SMS body stored only on device (Room, SQLCipher) and only per user retention preference; the server receives only extracted structured fields + non-sensitive hashed refs (`senderHash`, `messageHash`, hashed `upiRef`).
- **Classification:** rule-based income/expense/refund with confidence; ML hooks reserved behind the same interface for later.
- **Duplicates:** message hash, UPI ref hash, and fingerprint `(bank, amount, date, merchant)` checked against local + synced history.
- **Review gate:** detected items are `pending` drafts requiring user confirmation (auto-confirm only for explicit high-confidence familiar-merchant setting). Only confirmed items sync.
- **Permissions/consent flow** with in-app disclosure, per-bank toggles, and graceful pause on revocation.

## Alternatives Considered
- Flutter/React Native — insufficient/fragile for SMS privacy APIs, Keystore/biometric integration, and background reliability → rejected.
- Direct payment-app integration (GPay etc.) — no public general transaction-history API; disallowed by locked rule.
- Pure ML/NLP parser — heavy, hard to test per format; rule sets with corpus + telemetry give predictable quality first; ML layered later behind the same interface.
- Sending raw SMS to the server for parsing — privacy-negative; rejected (local parsing).

## Trade-offs
- Rule maintenance is required as bank formats change → mitigated by versioned rule sets, corpus-driven regression tests, and opt-in telemetry.
- SMS permissions are sensitive (Play policy) → justified usage, consent UX, privacy disclosures, data minimization.
- Local parsing complexity is higher but directly buys privacy and offline capability.

## Consequences
- Android scaffolding (Room, Keystore, sync wiring) precedes the SMS pipeline (Phase 6).
- Pipeline interfaces keep parser/classifier swappable (rules → ML later).
- Server-side fingerprints + clientId reuse makes SMS-duplicates impossible.
- Privacy/compliance artifacts (consent, Play justification, privacy policy) required before Android release.
