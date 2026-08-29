// Browser-safe facade over @moneytalks/shared (excludes the Node-only
// `fingerprint` module). Aliased to `@moneytalks/shared` in vite.config.ts.
export * from "../../../../packages/shared/src/enums.js";
export * from "../../../../packages/shared/src/money.js";
export * from "../../../../packages/shared/src/date.js";
export * from "../../../../packages/shared/src/categories.js";
export * from "../../../../packages/shared/src/budgets.js";
export * from "../../../../packages/shared/src/transactions.js";
