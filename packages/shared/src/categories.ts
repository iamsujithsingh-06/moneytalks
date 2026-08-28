import { EntityStatus } from "./enums.js";
import type { CategoryType, TransactionType } from "./enums.js";

export interface DefaultCategory {
  name: string;
  icon: string;
  type: CategoryType;
  isPreset: true;
  isDefault: boolean;
  status: EntityStatus;
  sortOrder: number;
}

/**
 * The built-in categories seeded for every new user. Order is fixed and
 * deterministic per type; `sortOrder` restarts at 0 for each type and must be
 * kept in sync with the array order (see DATABASE_ARCHITECTURE §3.2).
 */
export const DEFAULT_CATEGORY_CATALOG: readonly DefaultCategory[] = [
  // Income
  { name: "Salary", icon: "salary", type: "income", isPreset: true, isDefault: true, status: EntityStatus.Active, sortOrder: 0 },
  { name: "Freelance", icon: "briefcase", type: "income", isPreset: true, isDefault: false, status: EntityStatus.Active, sortOrder: 1 },
  { name: "Investments", icon: "trending-up", type: "income", isPreset: true, isDefault: false, status: EntityStatus.Active, sortOrder: 2 },
  { name: "Interest & Dividends", icon: "percent", type: "income", isPreset: true, isDefault: false, status: EntityStatus.Active, sortOrder: 3 },
  { name: "Refunds & Reimbursements", icon: "rotate-ccw", type: "income", isPreset: true, isDefault: false, status: EntityStatus.Active, sortOrder: 4 },
  { name: "Gifts", icon: "gift", type: "income", isPreset: true, isDefault: false, status: EntityStatus.Active, sortOrder: 5 },
  { name: "Other Income", icon: "plus-circle", type: "income", isPreset: true, isDefault: false, status: EntityStatus.Active, sortOrder: 6 },
  // Expense
  { name: "Food & Dining", icon: "utensils", type: "expense", isPreset: true, isDefault: true, status: EntityStatus.Active, sortOrder: 0 },
  { name: "Groceries", icon: "shopping-cart", type: "expense", isPreset: true, isDefault: false, status: EntityStatus.Active, sortOrder: 1 },
  { name: "Transport & Fuel", icon: "car", type: "expense", isPreset: true, isDefault: false, status: EntityStatus.Active, sortOrder: 2 },
  { name: "Rent & Housing", icon: "home", type: "expense", isPreset: true, isDefault: false, status: EntityStatus.Active, sortOrder: 3 },
  { name: "Utilities", icon: "zap", type: "expense", isPreset: true, isDefault: false, status: EntityStatus.Active, sortOrder: 4 },
  { name: "Shopping", icon: "bag", type: "expense", isPreset: true, isDefault: false, status: EntityStatus.Active, sortOrder: 5 },
  { name: "Entertainment", icon: "clapperboard", type: "expense", isPreset: true, isDefault: false, status: EntityStatus.Active, sortOrder: 6 },
  { name: "Health & Fitness", icon: "heart-pulse", type: "expense", isPreset: true, isDefault: false, status: EntityStatus.Active, sortOrder: 7 },
  { name: "Education", icon: "graduation-cap", type: "expense", isPreset: true, isDefault: false, status: EntityStatus.Active, sortOrder: 8 },
  { name: "Travel", icon: "plane", type: "expense", isPreset: true, isDefault: false, status: EntityStatus.Active, sortOrder: 9 },
  { name: "Subscriptions", icon: "repeat", type: "expense", isPreset: true, isDefault: false, status: EntityStatus.Active, sortOrder: 10 },
  { name: "Insurance", icon: "shield", type: "expense", isPreset: true, isDefault: false, status: EntityStatus.Active, sortOrder: 11 },
  { name: "Loans & EMI", icon: "credit-card", type: "expense", isPreset: true, isDefault: false, status: EntityStatus.Active, sortOrder: 12 },
  { name: "Family & Gifting", icon: "users", type: "expense", isPreset: true, isDefault: false, status: EntityStatus.Active, sortOrder: 13 },
  { name: "Personal Care", icon: "sparkles", type: "expense", isPreset: true, isDefault: false, status: EntityStatus.Active, sortOrder: 14 },
  { name: "Other Expense", icon: "more-horizontal", type: "expense", isPreset: true, isDefault: false, status: EntityStatus.Active, sortOrder: 15 },
];

const COMPATIBLE_CATEGORY_TYPES: Record<
  TransactionType,
  readonly CategoryType[]
> = {
  income: ["income"],
  expense: ["expense"],
  refund: ["expense"],
  transfer: ["transfer"],
  adjustment: ["income", "expense", "transfer"],
};

/**
 * Whether a category of `categoryType` may be assigned to a transaction of
 * `transactionType`. Income/expense/refund/transfer are restricted to a single
 * category type; adjustments may use any category type.
 */
export function isCategoryTypeCompatible(
  transactionType: TransactionType,
  categoryType: CategoryType,
): boolean {
  return COMPATIBLE_CATEGORY_TYPES[transactionType].includes(categoryType);
}
