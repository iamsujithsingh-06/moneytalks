# ADR-003: Authentication

- **Status:** Accepted
- **Date:** Phase 1
- **Related:** `SECURITY_ARCHITECTURE.md`

## Context
MoneyTalks requires secure, revocable, multi-device sessions across web and Android, with brute-force protection, device management, logout-all, and safe offline behavior (Android must be able to refresh without user re-entry). Passwords must never be stored raw; biometrics never stored.

## Decision
- **Password hashing:** Argon2id (memory-hard), params embedded in hash string for future upgrades; silent re-hash on login.
- **Access tokens:** short-lived (15 min) stateless JWT (`sub`, `deviceId`, `jti`, `type=access`, `tokenVersion`).
- **Refresh tokens:** opaque 256-bit, stored as SHA-256 hash on the device record, bound to `deviceId` + `refreshTokenFamily`, **rotated on every use**, reuse detection revokes the whole family.
- **Revocation:** refresh tokens revocable (logout, logout-all, device revoke, password change/reset); access tokens expire via short TTL; `tokenVersion` bump forces immediate invalidation for security events.
- **Device model:** each login registers a device record; device list + revoke available to user.
- **Storage:** web — httpOnly Secure SameSite=Strict cookie (or encrypted storage); Android — Android Keystore-protected EncryptedSharedPreferences, gated by PIN/biometric (see ADR on security behavior; documented in SECURITY_ARCHITECTURE).

## Alternatives Considered
- Pure server-side opaque sessions (Redis) — strong revocation but every request hits Redis; JWT short-TTL gives stateless validation with near-equivalent security posture.
- Long-lived single refresh token — simpler but worse on theft/rotation; rejected.
- JWT-only without refresh — poor UX, forces frequent re-login on mobile; rejected.
- Refresh token without rotation — replay risk; rejected.

## Trade-offs
- Rotation adds complexity (reuse detection, family revocation) for meaningfully better theft resistance.
- JWT revocation is delayed up to TTL unless `tokenVersion` is bumped (acceptable; bump used for incidents).
- Requires careful hashing of refresh tokens (store-only-hash) — a minor cost vs plaintext risk.

## Consequences
- Phase 2 implements auth flows + device records + audit logging.
- Sync engine depends on refresh capability (Android offline refresh) — auth layer must expose refresh before sync (Phase 5).
- Security events (password change, incident) must cascade token revocation.
