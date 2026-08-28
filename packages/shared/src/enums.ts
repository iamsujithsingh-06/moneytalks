export const UserStatus = {
  Pending: "pending",
  Active: "active",
  Disabled: "disabled",
} as const;

export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const DevicePlatform = {
  Web: "web",
  Android: "android",
} as const;

export type DevicePlatform = (typeof DevicePlatform)[keyof typeof DevicePlatform];

export const TransactionType = {
  Income: "income",
  Expense: "expense",
  Refund: "refund",
  Transfer: "transfer",
  Adjustment: "adjustment",
} as const;

export type TransactionType = (typeof TransactionType)[keyof typeof TransactionType];

export const TransactionSource = {
  Manual: "manual",
  Sms: "sms",
  Import: "import",
  Ocr: "ocr",
} as const;

export type TransactionSource = (typeof TransactionSource)[keyof typeof TransactionSource];

export const TransactionStatus = {
  Pending: "pending",
  Confirmed: "confirmed",
  Rejected: "rejected",
} as const;

export type TransactionStatus = (typeof TransactionStatus)[keyof typeof TransactionStatus];

export const TransactionDirection = {
  Inflow: "inflow",
  Outflow: "outflow",
} as const;

export type TransactionDirection =
  (typeof TransactionDirection)[keyof typeof TransactionDirection];

export const CategorizedBy = {
  Manual: "manual",
  Rule: "rule",
  Ai: "ai",
  Default: "default",
} as const;

export type CategorizedBy = (typeof CategorizedBy)[keyof typeof CategorizedBy];

export const CategoryType = {
  Income: "income",
  Expense: "expense",
  Transfer: "transfer",
} as const;

export type CategoryType = (typeof CategoryType)[keyof typeof CategoryType];

export const EntityStatus = {
  Active: "active",
  Archived: "archived",
} as const;

export type EntityStatus = (typeof EntityStatus)[keyof typeof EntityStatus];

export const PaymentMethodKind = {
  Upi: "upi",
  Card: "card",
  Bank: "bank",
  Wallet: "wallet",
} as const;

export type PaymentMethodKind =
  (typeof PaymentMethodKind)[keyof typeof PaymentMethodKind];

export const BudgetScope = {
  Category: "category",
  Overall: "overall",
} as const;

export type BudgetScope = (typeof BudgetScope)[keyof typeof BudgetScope];

export const BudgetPeriod = {
  Weekly: "weekly",
  Monthly: "monthly",
  Yearly: "yearly",
  Custom: "custom",
} as const;

export type BudgetPeriod = (typeof BudgetPeriod)[keyof typeof BudgetPeriod];

export const BudgetStatus = {
  Active: "active",
  Paused: "paused",
  Completed: "completed",
} as const;

export type BudgetStatus = (typeof BudgetStatus)[keyof typeof BudgetStatus];

export const BudgetAlertStatus = {
  Ok: "ok",
  Warning: "warning",
  Over: "over",
} as const;

export type BudgetAlertStatus =
  (typeof BudgetAlertStatus)[keyof typeof BudgetAlertStatus];

export const AnalyticsGranularity = {
  Daily: "daily",
  Weekly: "weekly",
  Monthly: "monthly",
} as const;

export type AnalyticsGranularity =
  (typeof AnalyticsGranularity)[keyof typeof AnalyticsGranularity];
