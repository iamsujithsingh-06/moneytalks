/** Backend create schemas default to INR. */
export const DEFAULT_CURRENCY = "INR";

/** A fresh UUID for `clientId` on entity creation. */
export function newClientId(): string {
  return crypto.randomUUID();
}
