# MoneyTalks — Android SMS Transaction Architecture (Phase 1)

> Status: Approved (design only). Reference: `adr/ADR-005-android-sms.md`.
> **Boundary:** No integration with any payment app's private API (e.g., no assumption of a public GPay transaction-history API). Detection is built on supported Android SMS/notification mechanisms + user-granted permissions.

---

## 1. Pipeline Overview

```
Bank/UPI SMS
   │  (SMS_BROADCAST / SMS_RETRIEVER / notification-based capture)
   ▼
SMS Receiver (system broadcast; local only)
   ▼
Filter (is financial? is one of supported banks/senders?)
   ▼
Transaction Detection (header/keyword heuristics)
   ▼
Parser (rule sets, versioned, multi-bank)
   ▼
Normalization (canonical draft)
   ▼
Classification (income/expense + confidence)
   ▼
Duplicate Detection (local + synced history)
   ▼
Local Transaction Draft (source=sms, status=pending)  ← stored in Room
   ▼
User Review (confirm/edit/reject)   [works fully offline]
   ▼
Sync Engine → MoneyTalks backend (confirmed items only)
```

---

## 2. Permission Model & User Consent

### Required permissions
- `RECEIVE_SMS` (or `READ_SMS` for backlog) — Android declares as **dangerous**; Play policy requires the default SMS handler **or** justification. Approach:
  - Primary path: **SMS Retriever API / notification-based capture** where supported (no broad SMS permission; automatic OTP-style verification with user confirmation).
  - Fallback path: `RECEIVE_SMS`/`READ_SMS` with full in-app consent, rationale screen, and explicit user toggle.
- `POST_NOTIFICATIONS` (to surface review/alert notifications) on Android 13+.
- No payment-app permissions. No accounts/GMS APIs that expose transaction history.
- User can revoke at any time → feature pauses gracefully (drafts already captured remain local).

### Consent & transparency
- First-run screen explains: what is read, why, where it is processed (mostly on-device), what syncs (extracted fields only, not raw text by default), how to disable.
- Settings toggles: enable/disable detection, per-bank opt-in, auto-confirm for familiar merchants, raw-message retention on device.

---

## 3. Message Capture Paths

| Path | How | Notes |
|---|---|---|
| Broadcast receiver (`SMS_RECEIVED_ACTION`) | Real-time financial SMS | Needs `RECEIVE_SMS`; interrupted by battery optimization → WorkManager catch-up scan |
| Backlog scan | `READ_SMS` one-time/historical import with user permission | On first enable; capped (e.g., last 500 messages) |
| Notification capture (Android 10+/APIs) | Listen for bank notifications | Reduced permission footprint; format varies more |
| SMS Retriever API | For verification-style confirmation UX | Complementary |

All paths feed the same pipeline. **Raw SMS body is stored only locally** (Room) and only if the user opts into raw-message retention; the server receives only extracted, normalized, non-sensitive fields.

---

## 4. Sender / Bank Identification

- Sender heuristics: alphanumeric sender ID, short codes, sender address regex, known bank/UPI brand list (curated, versioned).
- Rule sets are keyed by `(bank, formatVersion)`; unknown senders → generic parser attempt (see §8).

## 5. Transaction Detection (should-we-parse)

- Drop obvious non-financial: OTP, promotions, alerts without amounts, broadcasts.
- Heuristics: contains currency symbol + amount pattern (`₹\d+(,\d+)*(\.\d+)?`), keywords (`debited`, `credited`, `spent`, `paid`, `received`, `refund`, `upi`), known brand headers.
- Output: `{isFinancial, reason, bankGuess}`.

## 6. Parser Architecture — Rule-Based, Versioned, Evolvable

### Design
- **Rule sets** per bank/format. A rule set = ordered list of **patterns** (regex) + **field extractors** + **handlers** (amount sign, counterparty cleanup, UPI reference capture).
- Each rule set carries `version` + `testCorpus` reference. New SMS formats are added as new rule sets (or rule revisions) **without touching core code**.
- Parser output is a **raw parse**: `{ fields: {...}, matchedRule, perFieldConfidence, rawTextFingerprint, warnings[] }`.
- **Confidence scoring:** per-field (regex certainty, known patterns) + overall `0..1`; low-confidence overall → strong review requirement.

### Extraction targets (mapped to canonical fields)
| Raw field | Canonical field | Notes |
|---|---|---|
| Amount | `amountMinor` (integer minor units) | Currency-aware parse; commas/decimal locales |
| Direction (debited/credited/spent/paid vs received/refund) | `type` (expense/income/refund) + `direction` | Ambiguous → `refund` + review |
| Merchant / counterparty | `merchant` / `counterparty` | e.g., "PAYMENT TO SWIGGY", "FROM: RAVI KUMAR" |
| UPI reference | `smsRef.upiRef` | e.g., `417281920347` — stored hashed server-side for fingerprint; readable kept locally only |
| Bank reference | `smsRef.bankRef` | Txn ID/BankRef when present |
| Account/card reference | `accountRef` (masked, e.g., `A/c **1234`, `Card xxxx 1234`) | Never full number |
| Date/time | `transactionDate` | SMS timestamp fallback; parse embedded date |
| Payment method | `paymentMethodId` (match UPI/card/bank) | Infer from message cues |
| Bank/source | `bankSource` | From sender identification |
| Raw metadata | Local only: sender, receivedAt, raw body, message hash | Synced only as non-sensitive hash refs |

### Normalization
- Currency + amount → minor units; date → ISO; merchant cleanup (strip "PAYMENT TO/FROM" prefixes heuristically, dedupe whitespace); UPI id mask.
- Produces **canonical draft** matching the `transactions` entity shape.

## 7. Classification (income vs expense)

- Rule-based classifier over normalized fields + keywords + sender/bank.
- `refund` type when message says refund/credit-back.
- Confidence: `high` (clear keywords + amount + merchant), `medium` (clear amount but ambiguous merchant), `low` (weak signals).
- Reserved hooks for later ML-assisted classification (feature extraction + model) without changing the pipeline contract.

## 8. Unsupported Message Handling

- Unknown sender / no matching rule set → attempt generic parser (amount + direction + date only); if amount not confidently parseable → skip silently + log locally (privacy-safe telemetry, opt-in).
- Add-bank flow: user can report "wrong parse" → snapshot (raw text on-device only, no PII) attached to local telemetry for future rule-set training.
- Never crashes; always degrades to manual entry suggestion.

## 9. False-Positive / False-Negative Handling

### False positives (non-transaction treated as transaction)
- Strict filters (must have amount + direction signal + known/plausible sender).
- Draft status `pending` + review queue (user confirmation required) unless auto-confirm enabled for high-confidence familiar merchants.
- User "not a transaction" action feeds suppression list (sender/message-hash) locally.

### False negatives (missed transaction)
- Backlog re-scan + periodic catch-up (WorkManager) reduces misses from missed broadcasts.
- Manual "add from SMS" picker lets the user select any message to parse/review.
- Aggregation of suppression feedback into rule evolution (P2).

## 10. Duplicate Detection

- Multiple detectors (OR semantics):
  1. `messageHash` (normalized raw body) — exact same message.
  2. `upiRef` (when present, hashed) — same UPI txn ref.
  3. Fingerprint `(bankSource, amountMinor, transactionDate, merchant)` fuzzy match within window (e.g., ±2 days) → probable duplicate.
- Checked against **local drafts + synced ledger** (cached locally) → no duplicates across offline review and multi-device sync.
- On match: draft is not re-created; user sees "Already captured" linking to the existing item.

## 11. Local Storage (Android)

- Room DB: `sms_messages` (opt-in raw storage), `sms_drafts`, `transactions` (canonical local ledger), `sync_queue`.
- All under app-private storage; DB encrypted via SQLCipher with Keystore-derived key (see SECURITY_ARCHITECTURE §17).
- Confirmed drafts are detached from the raw message (raw message deletable per retention setting).

## 12. Sync of Detected Transactions

- Only **confirmed** items sync (drafts stay local until user acts).
- Synced payload: structured transaction fields + `smsRef` (hashed refs, senderHash, messageHash, receivedAt) — **no raw body**.
- Idempotent push (clientId) + server-side fingerprint dedupe (see SYNC_ARCHITECTURE).

## 13. Privacy Considerations (summary)

- Local-first processing; raw text default-local.
- Consent-driven permissions; revocable.
- Data minimization to server; raw text not uploaded by default.
- Clear user-facing disclosure in-app + store listing.
- Compliance note: follow Android/Play SMS policy; justify permission use; keep a privacy policy covering SMS data handling and deletion.
- Telemetry: opt-in, aggregate, no raw SMS/PII.

## 14. Evolvability Roadmap

- v1: rule sets + regex parser + test corpus.
- v2: parser rule editor (bundled config, no app update) + telemetry-driven rule improvement.
- v3: optional on-device ML (TensorFlow Lite) classifier for merchant cleanup + type classification, still gated behind rules.
- Architecture keeps parser/classifier behind interfaces so v3 swaps the classifier without pipeline changes.

## 15. Test Strategy (architecture)

- **Corpus-driven:** versioned corpus of real-ish SMS samples (sanitized) per bank; golden outputs. Regression gate for rule changes.
- Fuzz/adversarial: malformed amounts, multiple amounts, Unicode digits, amounts with tax breakdowns.
- Metrics to track (opt-in telemetry): parse rate, field accuracy, duplicate-hit rate, false-positive rate, confirmation rate.

## 16. Related Documents

- Pipeline end-to-end: `SYSTEM_ARCHITECTURE.md` (§7)
- Privacy/security: `SECURITY_ARCHITECTURE.md`
- Sync: `SYNC_ARCHITECTURE.md`
- Decision: `adr/ADR-005-android-sms.md`
