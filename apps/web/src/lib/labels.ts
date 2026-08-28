export const TYPE_LABELS: Record<string, string> = {
  income: "Income",
  expense: "Expense",
  refund: "Refund",
  transfer: "Transfer",
  adjustment: "Adjustment",
};

export const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  rejected: "Rejected",
};

export const DIRECTION_LABELS: Record<string, string> = {
  inflow: "Inflow",
  outflow: "Outflow",
};

export const KIND_LABELS: Record<string, string> = {
  income: "Income",
  expense: "Expense",
  transfer: "Transfer",
};

export const PAYMENT_KIND_LABELS: Record<string, string> = {
  upi: "UPI",
  card: "Card",
  bank: "Bank",
  wallet: "Wallet",
};

export const PERIOD_LABELS: Record<string, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
  custom: "Custom",
};

export const BUDGET_ALERT_LABELS: Record<string, string> = {
  ok: "On track",
  warning: "Watch out",
  over: "Over budget",
};
