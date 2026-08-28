# MoneyTalks — Authentication & Security Architecture (Phase 1)

> Status: Approved (design only). Reference: `adr/ADR-003-authentication.md`.

---

## 1. Security Principles

1. **Never store raw passwords** — only Argon2id hashes.
2. **Never store biometric data** — biometrics stay in the OS; app only gates key release.
3. **Least privilege & data minimization** — clients never receive raw SMS text, refresh-token hashes, or full account numbers.
4. **Defense in depth** — TLS, validation, isolation, rate limiting, audit logs, monitoring.
5. **Secrets only in the backend** — AI/OCR/email keys never reach clients.
6. **Revocability** — every session/device can be revoked; logout-all is always available.

---

## 2. Registration & Verification

- `POST /auth/register` validates (Zod), checks uniqueness, hashes password with **Argon2id** (OPSLIMIT/INTERACTIVE or stronger).
- Creates user `status=pending`; issues short-lived signed **verification token** (HMAC or DB-stored hash) with expiry (~24h), sent via email.
- `POST /auth/verify-email` marks active.
- Rate-limit registration per IP/email; generic responses to avoid account enumeration (see §12).

## 3. Login

- Verify credentials via Argon2id verify (constant-time).
- On success: create/attach **device record**, issue **access token** + **refresh token** (see §4–§5).
- **Generic error message** for wrong email/password ("invalid credentials") to avoid enumeration.
- Brute-force protection: failed-attempt counter, account lockout with exponential backoff, per-IP and per-account rate limits.

## 4. JWT Access Tokens

- Short-lived (~15 min) stateless JWT (HS256/RS256 — key from secret store; asymmetric recommended for multi-service future).
- Claims: `sub` (userId), `deviceId`, `iat`, `exp`, `jti`, `type: "access"`.
- Verified by middleware on every protected route; `userId` seeded into request context.
- **Not blacklisted on normal expiry** (short TTL); emergency revocation list in Redis for security events.

## 5. Refresh Tokens & Rotation

- Opaque random 256-bit token; **stored as SHA-256 hash** (never plaintext) on the device record.
- Bound to `deviceId` + `refreshTokenFamily`.
- **Rotation on every refresh:** old token invalidated, new token minted (same family). 
- **Reuse detection:** if a rotated-out token is presented again → likely theft → **revoke entire family** (all tokens for that device/user).
- TTL ~30 days, sliding (extended on active use), capped.
- Web: refresh token in `httpOnly` + `Secure` + `SameSite=Strict` cookie (CSRF-safe) OR encrypted storage; Android: Android Keystore-protected EncryptedSharedPreferences.

## 6. Token Revocation / Session Management

- Revocation sources: logout, logout-all, device revoke, password change, security incident.
- Revoked refresh tokens: hashed entries kept with TTL in Redis revocation list; family revocations cascade.
- Access tokens: short TTL limits exposure; on security events bump a per-user `tokenVersion` claim so old access tokens fail validation.
- Sessions are **per device**; user sees device list (`GET /devices`) and can revoke any.

## 7. Password Hashing Policy

- Algorithm: **Argon2id** (memory-hard, ASIC-resistant).
- Params: tune at implementation (target ~0.5–1s) — e.g., `m=64MiB, t=3, p=4` baseline; stored in the hash string for future param upgrades.
- **Re-hash on login** if params are outdated (silent upgrade).
- Password policy: min 12 chars, mixed case, digit; Pwned-password check optional (P2, via API).

## 8. Password Reset / Change

- Forgot-password: email a short-lived token (hash stored); on success reset password and **revoke all refresh tokens** (user must re-login everywhere).
- Change password: verify current password, policy-check new, revoke other sessions (keep current device).

## 9. Device Management

- Device record: name, platform, hashed fingerprint, token hashes/family, lastSeen.
- Revoke device → delete its refresh tokens; current access tokens expire via TTL (or immediate via tokenVersion bump on sensitive devices).
- Android re-registers FCM token per device.

## 10. Rate Limiting

- Layered: global/IP, per-user, per-endpoint.
- Auth endpoints: strict (register/login/forgot/reset — e.g., 5–10/min per IP + per account).
- Writes: e.g., 120/min per user (configurable).
- Implemented in Redis (sliding window); `Retry-After` header on 429.

## 11. Input Validation & Authorization

- Every boundary (body/query/params/file) validated by Zod schemas (shared package).
- **Authorization:** resource-level — service layer verifies `resource.userId === ctx.userId`; repository layer enforces userId scoping as defense-in-depth. No client-supplied userId ever accepted.
- No `eval`, no dynamic query construction from user input (parameterized Mongoose/aggregation only).

## 12. User Data Isolation & Enumeration Protection

- All collections scoped by `userId`; unique indexes are user-scoped.
- Generic error messages for auth (invalid credentials, always-success forgot-password) to prevent account enumeration.
- Email verification resend is rate-limited and returns success regardless of existence.

## 13. Secure File Uploads (receipts/imports)

- Accept-list MIME + magic-byte sniffing (not just extension); extension re-derived.
- Size limits (e.g., receipts ≤ 10 MB, imports ≤ 20 MB) with 413.
- **Malware/AV scan** on upload (object storage or scan service) before further use; quarantine on flag.
- Files stored private in object storage with server-side encryption; access only via **short-lived signed URLs** and only for the owning user.
- Never execute/render uploaded content; downloads stream with correct Content-Disposition.
- Filenames sanitized/regenerated (see DOCUMENT_ARCHITECTURE).

## 14. Receipt Image Security

- Encrypted at rest (object storage SSE), encrypted in transit (TLS).
- Private bucket/container; no public URLs.
- Signed URLs with TTL + scope (user, object); enforced access checks.
- Retention + deletion policy (see DOCUMENT_ARCHITECTURE); user deletion cascades object deletion.
- Optional user-facing watermark/blur of sensitive regions in UI (P2).

## 15. Sensitive Financial Data Protection

- Store only what is needed: masked account refs (`*1234`), no full account numbers server-side where avoidable.
- Raw SMS text **local-only** (Android); server stores extracted structured fields + non-sensitive refs (UPI ref treated as semi-sensitive, stored hashed where feasible and un-hashed only as needed for duplicate matching — decision: store UPI ref hashed for fingerprints, keep readable value only if required for user display; see SMS doc).
- DB access: restricted service credentials (no admin), network-restricted, encrypted at rest (Atlas disk encryption), TLS in transit.
- Backup encryption: user-key encrypted bundles for cloud backup.

## 16. API Security

- TLS 1.2+ only; HSTS; secure headers (CSP, X-Frame-Options, nosniff, referrer-policy).
- CORS locked to registered origins (no wildcards) + credentials policy.
- Idempotency keys to prevent duplicate writes on retry.
- Body size limits; JSON-only with strict parsing; `Content-Type` enforcement.
- Log sanitization: never log tokens, passwords, hashes, raw SMS, full card/account data.

## 17. Android Local Storage Security

- **Android Keystore** (hardware-backed where available) stores:
  - App-unlock secret key (gated by biometrics/PIN).
  - Refresh token wrapping keys.
- **EncryptedSharedPreferences** for tokens/settings.
- **Room (SQLite)** for ledger + queue — encrypted via **SQLCipher** with DB key derived from Keystore-wrapped key (Phase 2+ hardening; design mandates encryption from first Android release).
- DataStore for preferences; files (receipt images) stored in app-private storage.
- Screen-capture protection (FLAG_SECURE) on finance screens; keyboard input privacy (no autofill suggestion leakage for sensitive fields).
- Biometric unlock: `BiometricPrompt` + `setUserAuthenticationRequired(true)` on the Keystore key — key is released ONLY after successful biometric/PIN auth. **No biometric data is stored by the app.**

## 18. PIN Security

- PIN never stored raw.
- PIN-derived key via **PBKDF2/Argon2id stretch** → used to unwrap the Keystore-protected app-unlock secret (or wrap DB key).
- A salted **verifier hash** is stored locally only to check unlock attempts; not derivable to PIN.
- Attempt throttling + increasing cooldown + optional local wipe policy (configurable by user) after N failures.
- App lock engages on background/timeout (configurable); sensitive screens obscured from recents/thumbnails.

## 19. Biometric Authentication

- Native `BiometricPrompt` only; app never reads fingerprint/face data.
- Keystore key set `setUserAuthenticationRequired(true)` + `setInvalidatedByBiometricEnrollment(true)`.
- Fallback to PIN always available.
- On biometric change (enrollment), Keystore invalidates key → re-auth via PIN required.

## 20. Logout from All Devices

- `POST /auth/logout-all`: revoke all refresh tokens (delete/hash-list), optionally bump `tokenVersion` for instant access-token invalidation, clear device records (or keep history per user preference).
- Clients receive 401 on next use → re-login.

## 21. Audit Logging

- Written for security-relevant events: login, login-fail, logout, token refresh failure/reuse, password change/reset, device add/revoke, account delete, transaction create/delete/categorize, import commit, receipt commit, sync push, export download, AI chat, backup/restore.
- Fields: actor, action, target, before/after, ip, userAgent, requestId, timestamp.
- Write-only via service layer; retention ~90 days + archive (see OBSERVABILITY).

## 22. Incident Response Levers

- Immediate: revoke device/user family, bump `tokenVersion`, add IP to blocklist, quarantine user data, freeze account.
- All levers must be operable by an operator via admin tooling (Phase 11/12), with audit trail.

---

## 23. Threat Model (summary)

| Threat | Mitigation |
|---|---|
| Password brute-force | Argon2id + lockout + rate limits |
| Token theft | Rotation + reuse detection + family revocation + short access TTL + device binding |
| Stolen device | App lock (PIN/bio), Keystore, local DB encryption, remote device revoke |
| Account enumeration | Generic auth responses, always-success forgot/reset paths |
| CSRF (web) | SameSite=Strict httpOnly cookie + CORS allowlist |
| XSS | CSP, framework escaping, no HTML injection into charts/PDF |
| IDOR / data isolation breach | userId scoping in service+repo, resource ownership checks |
| Malicious uploads | Magic-byte MIME checks, size caps, AV scan, no execution, quarantine |
| Provider data leak (OCR/AI) | Consent, data-minimization, retention/deletion, provider terms review, encryption in transit |
| Replay of sync ops | Idempotency keys + clientId unique indexes + server timestamps |
| Insider/log leak | Sanitized logs, no secrets in logs, RBAC on admin tooling |
| Man-in-the-middle | TLS 1.2+ everywhere, HSTS, cert pinning on Android (optional) |

---

## 24. Related Documents

- Tokens/session details drive sync auth: `SYNC_ARCHITECTURE.md`
- Local-first SMS privacy: `SMS_TRANSACTION_ARCHITECTURE.md`
- Receipt data handling: `OCR_ARCHITECTURE.md` + `DOCUMENT_ARCHITECTURE.md`
- Audit log storage: `DATABASE_ARCHITECTURE.md` (§3.14)
- Decision: `adr/ADR-003-authentication.md`
