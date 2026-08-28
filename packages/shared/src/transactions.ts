import type { TransactionDirection, TransactionType } from "./enums.js";

/**
 * Derives the stored `direction` for a transaction from its type.
 *
 * `income`, `expense` and `refund` are fixed (a refund of an expense is money
 * coming back in). `transfer` and `adjustment` are ambiguous from the type
 * alone, so an explicit direction may be supplied; it defaults to inflow.
 */
export function deriveTransactionDirection(
  type: TransactionType,
  explicitDirection?: TransactionDirection,
): TransactionDirection {
  switch (type) {
    case "income":
    case "refund":
      return "inflow";
    case "expense":
      return "outflow";
    case "transfer":
    case "adjustment":
      return explicitDirection ?? "inflow";
  }
}
