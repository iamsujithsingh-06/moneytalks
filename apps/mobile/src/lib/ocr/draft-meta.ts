import type { PaymentMethod, ReceiptTransactionType } from "@moneytalks/ocr";

export function typeLabel(type: ReceiptTransactionType): string {
  switch (type) {
    case "income":
      return "Income";
    case "refund":
      return "Refund";
    default:
      return "Expense";
  }
}

export function paymentMethodLabel(method: PaymentMethod): string {
  switch (method) {
    case "upi":
      return "UPI";
    case "card":
      return "Card";
    case "cash":
      return "Cash";
    case "bank":
      return "Bank transfer";
    case "other":
      return "Other";
    default:
      return "Not detected";
  }
}

export const TYPE_OPTIONS: Array<{ value: ReceiptTransactionType; label: string }> = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "refund", label: "Refund" },
];

export const PAYMENT_METHOD_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank transfer" },
  { value: "other", label: "Other" },
  { value: null, label: "Not detected" },
];

/** Positive (credited) or negative (debited) minor-unit for display. */
export function signedMinor(type: ReceiptTransactionType, amountMinor: number): number {
  if (type === "expense") return -Math.abs(amountMinor);
  return Math.abs(amountMinor);
}
