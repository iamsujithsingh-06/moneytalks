# MoneyTalks — REST API Architecture (Phase 1)

> Status: Approved (specification only — endpoints are NOT implemented in Phase 1).

---

## 1. API Conventions

### Base
- `https://api.moneytalks.app/api/v1/` (versioned from day one).

### Auth on endpoints
- `🔒` = requires valid access token (default for all non-auth routes).
- `🔐` = requires refresh token (auth endpoints only).
- Tokens: `Authorization: Bearer <accessToken>` (web may use httpOnly secure cookie — chosen at deployment; header is canonical for API docs).
- Idempotency: write endpoints accept `Idempotency-Key: <uuid>` header; server dedupes retries.

### Data conventions
- Money as integer minor units + `currency` (ISO 4217).
- Dates ISO 8601; durations/granularity strings (`daily|weekly|monthly`).
- Pagination: `?limit&cursor` cursor-based for lists; returns `nextCursor`.
- Filters for transaction lists: `q`, `type`, `source`, `status`, `categoryId`, `paymentMethodId`, `from`, `to`, `minAmount`, `maxAmount`, `merchant`, `tags`, `duplicatesOnly`.
- Response envelope (uniform):
```json
{ "data": ..., "meta": { "requestId": "...", "nextCursor": null, "total": 0 } }
```
- Errors: standardized per `ERROR_HANDLING.md` — `{ "error": { "code", "message", "details?", "requestId" } }`.

### Async jobs
- Heavy endpoints return `{ "jobId": ... }`; status via `GET /jobs/:id`.

---

## 2. Endpoint Groups

### 2.1 Authentication (`/auth`)
| Method | Route | Purpose | Auth | Request | Response | Validation | Errors |
|---|---|---|---|---|---|---|---|
| POST | `/auth/register` | Create account | Public | `{email, password, name?}` | `201 {userId, emailVerified:false}` | Zod: email format, password policy | 409 email exists, 422 invalid |
| POST | `/auth/verify-email` | Verify email | Public | `{token}` | `200 {verified:true}` | token non-empty | 400 invalid/expired token |
| POST | `/auth/resend-verification` | Resend code | Public | `{email}` | `200` (always success, rate-limited) | email | 429 |
| POST | `/auth/login` | Log in | Public | `{email, password, device?}` | `200 {accessToken, refreshToken, user, deviceId}` | email/password | 401 invalid creds, 429 rate, 403 locked |
| POST | `/auth/refresh` | Rotate tokens | 🔐 | `{refreshToken}` | `200 {accessToken, refreshToken}` | — | 401 expired/revoked/replay |
| POST | `/auth/logout` | End session | 🔒 | `{deviceId}` | `204` | — | 401 |
| POST | `/auth/logout-all` | Logout everywhere | 🔒 | — | `204` | — | 401 |
| POST | `/auth/forgot-password` | Send reset | Public | `{email}` | `200` (always success) | email | 429 |
| POST | `/auth/reset-password` | Reset password | Public | `{token, newPassword}` | `204` | token, policy | 400 invalid/expired |

### 2.2 Users (`/users`)
| Method | Route | Purpose | Auth | Request | Response | Validation | Errors |
|---|---|---|---|---|---|---|---|
| GET | `/users/me` | Profile | 🔒 | — | `200 {user}` | — | 401 |
| PATCH | `/users/me` | Update profile/prefs | 🔒 | partial `{name?, defaultCurrency?, preferences?}` | `200 {user}` | Zod partial | 422 |
| PUT | `/users/me/password` | Change password | 🔒 | `{currentPassword, newPassword}` | `204` | policy; current verified | 401 wrong current, 422 |
| DELETE | `/users/me` | Delete account (erasure) | 🔒 | `{confirmation}` | `202 {jobId}` | — | 422 |
| GET | `/users/me/export` | Export all data | 🔒 | — | `202 {jobId}` | — | — |
| POST | `/users/me/preferences` | Update settings | 🔒 | partial prefs | `200` | Zod | 422 |

### 2.3 Transactions (`/transactions`)
| Method | Route | Purpose | Auth | Request | Response | Validation | Errors |
|---|---|---|---|---|---|---|---|
| GET | `/transactions` | List/filter/search | 🔒 | query params | `200 {items, nextCursor}` | filters Zod | 422 |
| POST | `/transactions` | Create | 🔒 | `{clientId, type, amountMinor, currency, transactionDate, categoryId?, merchant?, counterparty?, paymentMethodId?, accountRef?, note?, tags?, source?, status?}` | `201 {transaction}` | full Zod; type-specific | 409 duplicate, 422, 404 category |
| GET | `/transactions/:id` | Get one | 🔒 | — | `200 {transaction}` | — | 404 |
| PATCH | `/transactions/:id` | Update | 🔒 | partial fields | `200 {transaction}` | Zod partial | 404, 422, 409 duplicate |
| DELETE | `/transactions/:id` | Soft-delete | 🔒 | — | `204` | — | 404 |
| POST | `/transactions/:id/confirm` | Confirm pending draft | 🔒 | `{clientId?}` | `200` | — | 404, 409 |
| POST | `/transactions/:id/reject` | Reject draft | 🔒 | `{reason?}` | `200` | — | 404 |
| POST | `/transactions/:id/categorize` | Categorize (+rule/AI) | 🔒 | `{categoryId, categorizedBy?, categoryConfidence?}` | `200` | type match | 404, 422 |
| POST | `/transactions/dedupe-check` | Check duplicates before create | 🔒 | `{candidate fields}` | `200 {matches}` | Zod | 422 |

### 2.4 Categories (`/categories`)
| Method | Route | Purpose | Auth | Request | Response | Validation | Errors |
|---|---|---|---|---|---|---|---|
| GET | `/categories` | List (incl. deleted flag) | 🔒 | `?type=` | `200 {items}` | — | — |
| POST | `/categories` | Create | 🔒 | `{name, type, parentId?, icon?, color?}` | `201` | Zod; unique per user | 409, 422 |
| PATCH | `/categories/:id` | Update | 🔒 | partial | `200` | Zod | 404, 422 |
| DELETE | `/categories/:id` | Soft-delete (reassign txns) | 🔒 | `{reassignToId?}` | `204` | — | 404, 409 if in use |
| POST | `/categories/defaults` | Restore default set | 🔒 | — | `201` | — | — |

### 2.5 Budgets (`/budgets`)
| Method | Route | Purpose | Auth | Request | Response | Validation | Errors |
|---|---|---|---|---|---|---|---|
| GET | `/budgets` | List with spend | 🔒 | `?period=&from=&to=` | `200 {items:{...,allocatedMinor,spentMinor,percent,status}}` | — | — |
| POST | `/budgets` | Create | 🔒 | `{categoryId?, scope, period, allocatedMinor, currency, rollover?, alertThresholds?}` | `201` | Zod; unique active | 409 duplicate, 422 |
| PATCH | `/budgets/:id` | Update | 🔒 | partial | `200` | Zod | 404, 422 |
| DELETE | `/budgets/:id` | Soft-delete | 🔒 | — | `204` | — | 404 |
| GET | `/budgets/summary` | Period budget health | 🔒 | `?period=&from=&to=` | `200` | — | — |

### 2.6 Savings Goals (`/savings-goals`)
| Method | Route | Purpose | Auth | Request | Response | Validation | Errors |
|---|---|---|---|---|---|---|---|
| GET | `/savings-goals` | List w/ progress | 🔒 | — | `200 {items}` | — | — |
| POST | `/savings-goals` | Create | 🔒 | `{name, targetMinor, currency, targetDate?, monthlyContribution?}` | `201` | Zod | 422 |
| PATCH | `/savings-goals/:id` | Update | 🔒 | partial | `200` | Zod | 404, 422 |
| DELETE | `/savings-goals/:id` | Archive/delete | 🔒 | — | `204` | — | 404 |
| POST | `/savings-goals/:id/allocate` | Record contribution | 🔒 | `{amountMinor, currency, transactionId?}` | `200` | Zod | 404, 422 |

### 2.7 Analytics (`/analytics`)
| Method | Route | Purpose | Auth | Request | Response | Validation | Errors |
|---|---|---|---|---|---|---|---|
| GET | `/analytics/summary` | Period analytics | 🔒 | `?from=&to=&granularity=` | `200 {income, expense, cashFlow, categoryBreakdown[], trend[], topMerchants[], anomalies[]}` | ranges | 422 |
| GET | `/analytics/cashflow` | Cash-flow series | 🔒 | `?from=&to=&granularity=` | `200 {series}` | — | 422 |
| GET | `/analytics/categories` | Category breakdown | 🔒 | `?from=&to=&type=` | `200 {items}` | — | 422 |
| GET | `/analytics/insights` | Discover insight cards | 🔒 | `?refresh=false` | `200 {insights[]}` | — | — |

### 2.8 Dashboard (`/dashboard`)
| Method | Route | Purpose | Auth | Request | Response | Validation | Errors |
|---|---|---|---|---|---|---|---|
| GET | `/dashboard/summary` | Dashboard aggregate | 🔒 | — | `200 {balance, monthIncome, monthExpense, net, topCategories[], recent[], budgets[], goals[], insights[]}` | — | — |

### 2.9 Recurring Transactions (`/recurring`)
| Method | Route | Purpose | Auth | Request | Response | Validation | Errors |
|---|---|---|---|---|---|---|---|
| GET | `/recurring` | List templates | 🔒 | — | `200` | — | — |
| POST | `/recurring` | Create template | 🔒 | `{name, type, amountMinor, currency, frequency, interval, startDate, nextDueAt?, categoryId?, merchant?, paymentMethodId?}` | `201` | Zod | 422 |
| PATCH | `/recurring/:id` | Update | 🔒 | partial | `200` | Zod | 404, 422 |
| DELETE | `/recurring/:id` | Cancel | 🔒 | — | `204` | — | 404 |
| POST | `/recurring/detect` | Run detection over history | 🔒 | — | `202 {jobId}` | — | — |

### 2.10 Import / Export (`/imports`, `/exports`)
| Method | Route | Purpose | Auth | Request | Response | Validation | Errors |
|---|---|---|---|---|---|---|---|
| POST | `/imports` | Upload file (multipart) | 🔒 | `file, targetCurrency?` | `201 {importId}` | MIME/size Zod | 413, 415, 422 |
| GET | `/imports/:id` | Status + preview | 🔒 | — | `200 {status, columns, rows[], rowStats}` | — | 404 |
| POST | `/imports/:id/mapping` | Set column mapping | 🔒 | `{mapping}` | `200` | Zod | 404, 422 |
| POST | `/imports/:id/commit` | Commit accepted rows | 🔒 | `{confirmedRowIds[], options?}` | `202 {jobId}` | — | 404, 422 |
| DELETE | `/imports/:id` | Abort import | 🔒 | — | `204` | — | 404 |
| POST | `/exports` | Create export job | 🔒 | `{format:'csv'|'xlsx', filters?}` | `202 {exportId}` | Zod | 422 |
| GET | `/exports/:id` | Job status | 🔒 | — | `200` | — | 404 |
| GET | `/exports/:id/download` | Download file (signed) | 🔒 | — | `200 stream` | — | 404, 410 expired |

### 2.11 Reports (`/reports`)
| Method | Route | Purpose | Auth | Request | Response | Validation | Errors |
|---|---|---|---|---|---|---|---|
| POST | `/reports/monthly` | Generate monthly PDF | 🔒 | `{month, year}` | `202 {reportId}` | Zod | 422 |
| GET | `/reports/:id` | Status | 🔒 | — | `200` | — | 404 |
| GET | `/reports/:id/download` | Download PDF (signed) | 🔒 | — | `200 stream` | — | 404, 410 expired |
| GET | `/reports` | List past reports | 🔒 | — | `200` | — | — |

### 2.12 Receipts / OCR (`/receipts`)
| Method | Route | Purpose | Auth | Request | Response | Validation | Errors |
|---|---|---|---|---|---|---|---|
| POST | `/receipts` | Upload image → OCR job | 🔒 | `file, autoCommit?, linkTransactionId?` | `201 {receiptId, status}` | MIME/size | 413, 415 |
| GET | `/receipts/:id` | Status + OCR result | 🔒 | — | `200 {status, extracted{draft, confidence}}` | — | 404 |
| POST | `/receipts/:id/commit` | Create transaction from draft | 🔒 | `{overrides?}` | `201 {transaction}` | Zod; confidence gate | 404, 422, 409 duplicate |
| POST | `/receipts/:id/reject` | Discard draft | 🔒 | — | `204` | — | 404 |
| GET | `/receipts/:id/image` | View receipt image (signed, short TTL) | 🔒 | — | `200 stream` | — | 404, 410 |

### 2.13 Devices (`/devices`)
| Method | Route | Purpose | Auth | Request | Response | Validation | Errors |
|---|---|---|---|---|---|---|---|
| GET | `/devices` | List my devices | 🔒 | — | `200 {items}` | — | — |
| DELETE | `/devices/:id` | Revoke a device | 🔒 | — | `204` | — | 404, 403 (self-revoke via logout) |
| PATCH | `/devices/:id` | Rename/update | 🔒 | `{name?}` | `200` | Zod | 404 |

### 2.14 Synchronization (`/sync`)
| Method | Route | Purpose | Auth | Request | Response | Validation | Errors |
|---|---|---|---|---|---|---|---|
| GET | `/sync/changes` | Pull changes since cursor | 🔒 | `?cursor=&entities=&limit=` | `200 {itemsByEntity, nextCursor, hasMore}` | — | — |
| POST | `/sync/push` | Push batched ops | 🔒 | `{deviceId, ops:[{entity, op, idempotencyKey, payload, clientId}]}` | `200 {results:[{status:'applied'|'duplicate'|'conflict', canonical?}]}` | Zod; idempotency keys | 409, 422 |
| GET | `/sync/state` | Sync health/cursor | 🔒 | — | `200 {records[]}` | — | — |
| GET | `/sync/bootstrap` | Initial pull (baseline) | 🔒 | — | `200 {users, categories, transactions, ...}` | — | — |

### 2.15 Notifications (`/notifications`)
| Method | Route | Purpose | Auth | Request | Response | Validation | Errors |
|---|---|---|---|---|---|---|---|
| GET | `/notifications` | List | 🔒 | `?limit&cursor` | `200` | — | — |
| PATCH | `/notifications/:id` | Mark read | 🔒 | — | `200` | — | 404 |
| POST | `/notifications/read-all` | Mark all read | 🔒 | — | `204` | — | — |
| PUT | `/notifications/preferences` | Channel prefs | 🔒 | `{preferences}` | `200` | Zod | 422 |
| POST | `/devices/:id/fcm-token` | Register push token | 🔒 | `{fcmToken}` | `204` | — | 404 |

### 2.16 AI Assistant (`/ai`)
| Method | Route | Purpose | Auth | Request | Response | Validation | Errors |
|---|---|---|---|---|---|---|---|
| POST | `/ai/chat` | Ask grounded question | 🔒 | `{message, history?}` | `200 {answer, references[], intent}` | Zod; msg length | 402 feature, 503 provider down, 422 |
| GET | `/ai/insights` | List stored insights | 🔒 | — | `200 {items}` | — | — |
| POST | `/ai/insights/refresh` | Recompute insights | 🔒 | — | `202 {jobId}` | — | — |
| POST | `/ai/insights/:id/feedback` | Feedback (dismiss/like) | 🔒 | `{action}` | `204` | Zod | 404 |

### 2.17 Settings (`/settings`)
| Method | Route | Purpose | Auth | Request | Response | Validation | Errors |
|---|---|---|---|---|---|---|---|
| GET | `/settings` | Full settings | 🔒 | — | `200` | — | — |
| PUT | `/settings` | Update settings | 🔒 | `{defaultCurrency?, theme?, aiFeaturesEnabled?, smsAutoConfirm?, receiptAutoCommit?, notificationPrefs?}` | `200` | Zod | 422 |

### 2.18 Security (`/security`)
| Method | Route | Purpose | Auth | Request | Response | Validation | Errors |
|---|---|---|---|---|---|---|---|
| GET | `/security/audit` | My audit trail | 🔒 | `?limit&cursor` | `200` | — | — |
| POST | `/security/confirm-action` | Re-auth for sensitive ops | 🔒 | `{password}` | `200 {token}` | — | 401 |
| GET | `/security/backup` | Backup info | 🔒 | — | `200` | — | — |
| POST | `/security/backup` | Create encrypted backup | 🔒 | `{publicKey?, keyId?}` | `202 {jobId}` | — | — |
| POST | `/security/backup/restore` | Restore from backup | 🔒 | `{backupId, keyMaterial?}` | `202 {jobId}` | — | 409 restore-in-progress |

### 2.19 Jobs (`/jobs`)
| Method | Route | Purpose | Auth | Request | Response | Validation | Errors |
|---|---|---|---|---|---|---|---|
| GET | `/jobs/:id` | Job status | 🔒 | — | `200 {status, kind, error?, resultRef?}` | — | 404 |

### 2.20 Misc
| Method | Route | Purpose | Auth | Request | Response | Validation | Errors |
|---|---|---|---|---|---|---|---|
| GET | `/health` | Liveness/readiness | Public | — | `200 {status, checks}` | — | — |
| GET | `/meta` | Versions, limits, feature flags | Public | — | `200` | — | — |

---

## 3. Cross-Cutting Rules

- **Authz:** every handler resolves `userId` from token; every query/update is userId-scoped. No client-supplied `userId`.
- **Idempotency:** `Idempotency-Key` stored (hash) keyed by `(userId, key)` for 24h; duplicate request returns original response.
- **Validation:** Zod schemas from `packages/validation`; 422 with `details[]` on failure.
- **Rate limits:** per-user and per-IP on auth + write-heavy endpoints (see SECURITY).
- **Pagination:** cursor-based (opaque `nextCursor`); no offset paging for user data.
- **Versioning:** `X-API-Version` + path version; breaking changes bump major path.
- **Retry-After:** included on 429.
- **Sensitive data:** never return `passwordHash`, `refreshTokenHash`, raw SMS, full receipt OCR PII beyond need; mask account refs.
