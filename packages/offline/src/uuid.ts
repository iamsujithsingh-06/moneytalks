/** Portable UUID v4. Prefers the platform `crypto.randomUUID`, falling back
 *  to a Math.random-based v4 so the package works outside secure contexts
 *  (tests, non-TLS PWA dev). Never used for security-sensitive keys. */
export function uuid(): string {
  if (
    typeof globalThis !== "undefined" &&
    typeof globalThis.crypto !== "undefined" &&
    typeof (globalThis.crypto as Crypto).randomUUID === "function"
  ) {
    return (globalThis.crypto as Crypto).randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** A fresh UUID used as the `clientId` for a locally-created document. */
export function newClientId(): string {
  return uuid();
}
