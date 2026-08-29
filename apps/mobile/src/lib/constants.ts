/** Backend create schemas default to INR. */
export const DEFAULT_CURRENCY = "INR";

function uuid(): string {
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** A fresh UUID for `clientId` on entity creation. */
export function newClientId(): string {
  return uuid();
}
