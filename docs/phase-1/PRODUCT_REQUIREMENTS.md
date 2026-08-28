# MoneyTalks — Product Requirements Document (Phase 1)

> Status: Approved as the foundation for Phase 2 implementation.
> This document defines **what** MoneyTalks is. It deliberately does not prescribe UI or implementation details beyond what is necessary to frame the product.

---

## 1. Product Overview

MoneyTalks is a personal finance management platform that helps users automatically capture, organize, understand, and improve their financial activity. It is not a generic expense tracker — it is a serious financial product with an offline-first, multi-device, Android-companion-enabled architecture.

MoneyTalks answers two core questions for the user:

> **"Track your money. Understand your money."**

MoneyTalks reduces the effort of recording transactions to near zero by automatically detecting transactions from bank/UPI SMS on Android, importing from CSV/Excel, and extracting transaction data from receipt images via OCR. It then provides budgets, savings goals, analytics, monthly PDF reports, and a grounded AI financial assistant to help the user understand and act on their money.

### Target platform matrix

| Surface | Role | Notes |
|---|---|---|
| Web client (React + Vite) | Primary interactive surface, dashboards, analytics, budgets, reports | Responsive, desktop + mobile browser |
| Android companion app | Automatic SMS-based transaction detection, offline capture, quick entry, sync | Works alongside the web client; also usable standalone for capture |

---

## 2. Problem Statement

Most people do not know where their money goes each month.

The leading causes:

1. **Manual tracking is burdensome.** Recording every expense is tedious, so users stop within weeks.
2. **Data is fragmented.** Transactions live across bank apps, UPI apps, wallets, and cards. There is no single trustworthy ledger.
3. **Insight is missing.** Even when users have data, interpreting it — "why did I spend more this month?" — requires manual analysis.
4. **Trust barriers.** Users will not hand a general-purpose app unrestricted access to their bank accounts. SMS-based detection and manual/import capture offer a lower-trust, privacy-friendly path to rich data.
5. **Connectivity assumptions.** Existing trackers fail when offline; users in low-connectivity environments cannot rely on always-online apps.

MoneyTalks solves these by making capture automatic (SMS, OCR, import), storage unified and offline-first, and insight grounded in the user's own calculated data.

---

## 3. Target Users

### Primary persona — "The Busy Professional"
- 25–45, urban, tech-comfortable.
- Uses UPI / cards / net banking heavily.
- Wants awareness of spending without manual logging.
- Values privacy; is reluctant to grant bank account access.
- Uses Android or a web browser (often both).

### Secondary persona — "The Budgeter"
- Actively manages budgets and savings goals.
- Needs reliable categorization, budgets, and alerts.
- Will import bank CSV/Excel exports.
- Expects monthly summaries (PDF) and export for tax/accounting.

### Tertiary persona — "The Money-Curious"
- Wants to understand spending patterns, trends, and AI-driven insights.
- Answers questions like "Where did my money go?" in plain language.
- May upgrade to budgets/goals later.

### Non-target users (Phase 1 boundary)
- Users seeking open-banking / account aggregation (not in scope).
- Family/group finance management (not in scope for Phase 1).
- Business/bookkeeping grade accounting (MoneyTalks is personal finance).

---

## 4. Product Goals

1. Make transaction capture near-zero-effort through SMS detection, OCR, and import.
2. Provide a unified, correct, single ledger of income, expense, refund, transfer, and adjustment transactions.
3. Help users understand spending through grounded analytics and an AI assistant.
4. Help users control money through budgets, savings goals, and alerts.
5. Remain trustworthy: privacy-first, secure, offline-capable, and multi-device consistent.
6. Be production-grade: scalable, observable, testable, and maintainable.

---

## 5. Non-Goals (Phase 1 and locked)

- No open-banking / Plaid-style bank account aggregation.
- No direct Google Pay (GPay) API integration or assumption of a public general transaction-history API. Automatic detection is SMS/notification-based with user-granted permissions.
- No social / family sharing features.
- No cryptocurrency portfolio management.
- No investment portfolio management.
- No biller integrations (auto-pay on behalf of user).
- No built-in payment execution.
- No multi-currency wallet/conversion engine in Phase 1 (single default currency, with field reserved for multi-currency in data model).
- No web-only OCR in Phase 1 (receipt upload is via web/API; client-side OCR is Android-era enhancement).

---

## 6. Core Value Proposition

**MoneyTalks builds your financial ledger for you** — from the SMS already in your phone, the receipts already on your camera roll, and the bank exports already on your laptop — **then tells you what it means** in plain language, grounded in your actual numbers.

- Automatic capture (SMS / OCR / import) → near-zero manual entry.
- One trustworthy ledger across income, expense, refund, transfer, adjustment.
- Grounded AI insights → understanding, not generic advice.
- Offline-first → capture anywhere, sync when connected.
- Privacy-first → no bank account access required; SMS data stays local-first and consent-driven.

---

## 7. Main User Problems & Product Response

| # | User problem | Product response |
|---|---|---|
| P1 | Recording every expense is tedious | Automatic SMS detection; OCR receipts; CSV/Excel import; quick add |
| P2 | I don't know where my money goes | Analytics, category breakdowns, dashboard |
| P3 | I can't tell why my spending increased | Grounded AI insights over calculated data |
| P4 | I overspend without noticing | Budgets, savings goals, smart spending alerts |
| P5 | My data is scattered across apps | Unified offline-first ledger + multi-device sync |
| P6 | I don't trust apps with bank access | SMS/OCR/import model; local-first processing; explicit consent |
| P7 | I lose track of manual cash/refunds | Full transaction model incl. refund, transfer, adjustment |
| P8 | I need records for tax/accounting | CSV/Excel export, monthly PDF reports |
| P9 | I want privacy even on my own device | App lock (PIN + biometric), secure local storage |

---

## 8. Product Principles

1. **Correctness first.** The ledger must be accurate. Duplicate prevention, idempotency, and confidence-gated automation are non-negotiable.
2. **Trust through privacy.** Minimize data collected, keep processing local-first where possible, require consent, never store biometrics or raw passwords.
3. **Ground automation in evidence.** Every auto-detected transaction links back to its source (SMS, receipt, import row) with confidence and review status.
4. **Offline-first by design.** Capture and view must work offline; sync is eventual but data loss is never acceptable.
5. **The user is always in control.** Automation suggests; the user confirms, edits, or rejects. AI never modifies transactions.
6. **Serious financial product.** Premium, dark-first, minimal, high readability. Not a toy.
7. **Scalable architecture.** Monorepo, typed, layered, observable, testable from day one.
8. **Grounded AI.** AI answers are calculated from the user's own application data, never invented.
9. **Consistency across devices.** The web and Android surfaces share the same data model and sync protocol.

---

## 9. Functional Requirements

### FR-01 Authentication & Users
- Email + password registration with email verification.
- Login/logout; JWT access + refresh tokens.
- Password recovery via email.
- Profile management; user data export/deletion (right to erasure).

### FR-02 Transaction Management
- CRUD for transactions of types: income, expense, refund, transfer, adjustment.
- Sources: manual, sms, import, ocr.
- Fields: amount, currency, date, category, merchant/counterparty, payment method, account, external reference, raw source info, status (pending/confirmed/rejected), confidence.
- Duplicate detection on create/import/sync.
- Search + advanced filtering (date range, category, merchant, amount, source, status, text).

### FR-03 Categorization
- Default categories (income/expense); user-defined categories.
- Manual categorization; rules for automatic categorization; AI-assisted categorization suggestions (reviewed by user).

### FR-04 Budgets
- Budgets per category with period (monthly/weekly/yearly/custom).
- Budget tracking (spent vs allocated), rollover option, alerts near/over threshold.

### FR-05 Savings Goals
- Goal creation with target amount and target date.
- Progress tracking, manual allocation, contribution suggestions.

### FR-06 Analytics & Dashboard
- Dashboard: balance, cash flow, top categories, recent activity.
- Analytics: trends, category breakdowns, month-over-month comparisons, cash flow analysis.

### FR-07 Recurring Transactions
- Define recurring templates (interval, next due, active/paused).
- Detection of recurring patterns; auto-creation suggestions with review.

### FR-08 Import / Export
- CSV/Excel import with column mapping, validation, preview, duplicate handling.
- CSV/Excel export; monthly PDF report generation and download.

### FR-09 Receipts & OCR
- Receipt image upload (image validation, size/MIME checks, secure storage).
- OCR processing with extracted fields, confidence, and user review before transaction creation.

### FR-10 Android SMS Detection
- Consent-driven SMS reading on Android.
- Rule-based parser for bank/UPI SMS across multiple formats.
- Extraction of amount, type, merchant/counterparty, UPI reference, account ref, date/time, payment method, bank.
- Local classification + duplicate detection, then sync.

### FR-11 Offline-First & Sync
- Create/edit/delete offline with local IDs and sync queue.
- Eventual consistency via sync protocol; idempotent, retry with exponential backoff, conflict resolution.
- Multi-device sync without duplicates or data loss.

### FR-12 Security & Device Management
- PIN + biometric app lock on mobile.
- Device listing, revoke device, logout from all devices.
- Cloud backup of user data (opt-in) with encryption.

### FR-13 AI Assistant
- Natural language questions over the user's own calculated data (intent → data layer → grounded answer).
- AI-generated insights (anomaly detection, trend summaries).
- AI never creates or modifies transactions; suggestions require user review.

### FR-14 Smart Alerts & Notifications
- Budget alerts, unusual spending, sync/import completion, AI insight availability.
- Notification preferences per channel.

### FR-15 Global
- Dark-first premium design, responsive, accessible.
- Localization-ready (i18n) but Phase 1 ships English.

---

## 10. Non-Functional Requirements (Summary)

See `NFR.md` for the full document. Summary targets:

- Performance: API p95 < 300 ms core endpoints; dashboard < 1 s client-side.
- Availability: 99.5% monthly uptime target for API.
- Security: Argon2id password hashing, JWT + rotating refresh tokens, TLS everywhere, input validation on every boundary, user data isolation.
- Privacy: local-first SMS processing, consent required, raw passwords/biometrics never stored.
- Reliability: no data loss in offline→sync transitions; idempotent writes.
- Scalability: stateless API designed to scale horizontally; MongoDB Atlas with indexed hot paths.
- Maintainability: TypeScript monorepo, linted, tested, documented.
- Accessibility: WCAG 2.1 AA target for web.
- Observability: structured logs, request IDs, metrics, health checks, audit logs.

---

## 11. Feature List (Full, Locked)

### Account & Security
1. User registration (email + password)
2. Email verification
3. Login / logout
4. Password recovery / reset
5. JWT + refresh token session management
6. Device management
7. Logout from all devices
8. PIN app lock
9. Biometric app lock
10. Cloud backup (opt-in)
11. User data export / deletion

### Transactions
12. Add income
13. Add expense
14. Add refund
15. Add transfer
16. Add adjustment
17. Edit transaction
18. Delete transaction (soft-delete)
19. Categorize transaction (manual + rules + AI suggestions)
20. Duplicate transaction detection
21. Search and advanced filtering
22. Recurring transaction detection
23. Smart spending alerts

### SMS (Android)
24. Automatic SMS transaction detection
25. Automatic income detection
26. Automatic expense detection
27. Transaction review / confirmation
28. Multi-format SMS parser (rule-based, evolvable)

### OCR
29. Receipt image upload
30. OCR receipt processing
31. Extracted-field review → transaction creation

### Budgets & Goals
32. Create budget
33. Track budget (spent vs allocated, alerts)
34. Create savings goal
35. Track savings goal progress

### Analytics
36. Dashboard
37. Financial analytics (trends, breakdowns, comparisons)
38. AI financial insights
39. AI financial assistant (Q&A grounded in data)

### Data Management
40. CSV/Excel import
41. CSV/Excel export
42. Monthly financial PDF report
43. Offline transaction creation
44. Sync after reconnect
45. Multi-device synchronization

### Platform
46. Dark mode (dark-first)
47. Responsive web UI
48. Android companion app

---

## 12. Feature Priorities

### P0 — Core / Mandatory (must exist before product can launch)
- User registration, email verification, login/logout, password recovery
- JWT + refresh token sessions, device management, logout from all devices
- Transaction CRUD for all 5 types (income, expense, refund, transfer, adjustment)
- Manual categorization; default + custom categories
- Duplicate transaction detection
- Dashboard
- Budgets (create + track)
- Savings goals (create + track)
- Analytics (trends, breakdowns, comparisons)
- Search + advanced filtering
- CSV/Excel import + export
- Monthly PDF report
- Offline-first transaction entry + sync
- Multi-device synchronization
- PIN app lock (mobile) + biometric app lock (mobile)
- Dark-first design + responsive web UI
- Security foundation (hashing, input validation, isolation, audit log, rate limiting)

### P1 — Important (launch +1, differentiator)
- Android companion app + SMS transaction detection
- Automatic income/expense detection with review/confirmation
- Multi-format SMS parser
- Smart spending alerts
- Recurring transaction detection
- Receipt upload + OCR with confidence + user review
- Cloud backup (opt-in)
- Notification preferences

### P2 — Advanced (post-launch polish)
- AI financial assistant (Q&A grounded in app data)
- AI-generated financial insights
- AI-assisted category suggestions
- Advanced recurring detection ML
- Receipt OCR auto-commit mode (high confidence + user opt-in)
- i18n localization

> **No locked feature is removed.** Priorities only order the work.

---

## 13. Success Criteria (product-level)

- A user can go from zero to a populated, understood ledger in under 5 minutes of manual effort (auto-detected/imported data).
- Duplicate transactions never appear in the ledger from re-sync, double import, or SMS re-detection.
- Offline-created transactions sync correctly to all devices with no data loss and no silent overwrite.
- AI answers can be traced to the underlying calculated data; the AI cannot invent figures.
- A new developer can implement the platform from Phase 1 documentation without redesigning architecture.
