import type { DraftTransactionType, SmsPaymentMethodKind } from "@moneytalks/sms";

export function typeLabel(type: DraftTransactionType): string {
  switch (type) {
    case "income":
      return "Income";
    case "refund":
      return "Refund";
    default:
      return "Expense";
  }
}

/** MoneyTalks transaction `type` values used when confirming. */
export function toTxType(type: DraftTransactionType): string {
  return type;
}

export function paymentMethodLabel(kind: SmsPaymentMethodKind): string {
  switch (kind) {
    case "upi":
      return "UPI";
    case "card":
      return "Card";
    case "bank":
      return "Bank transfer";
    case "wallet":
      return "Wallet";
    default:
      return "Not detected";
  }
}

export const PAYMENT_METHOD_OPTIONS: Array<{ value: SmsPaymentMethodKind; label: string }> = [
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "bank", label: "Bank transfer" },
  { value: "wallet", label: "Wallet" },
  { value: null, label: "Not detected" },
];

export const TYPE_OPTIONS: Array<{ value: DraftTransactionType; label: string }> = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "refund", label: "Refund" },
];

/** Positive (credited) or negative (debited) minor-unit for display. */
export function signedMinor(type: DraftTransactionType, amountMinor: number): number {
  if (type === "expense") return -Math.abs(amountMinor);
  return Math.abs(amountMinor);
}

/** Short confirmation banner text describing where the record came from. */
export function bankLabel(bankSource: string | null): string {
  if (!bankSource) return "SMS";
  return `${bankSource.toUpperCase()} · SMS`;
}
