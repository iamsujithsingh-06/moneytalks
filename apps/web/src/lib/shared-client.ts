// Browser-safe facade over @moneytalks/shared.
// Re-exports the shared modules the web client needs, excluding the Node-only
// `fingerprint` module (uses node:crypto). Aliased to `@moneytalks/shared` in
// vite.config.ts so app code keeps importing from the package specifier.
export * from "../../../../packages/shared/src/enums.js";
export * from "../../../../packages/shared/src/money.js";
export * from "../../../../packages/shared/src/date.js";
export * from "../../../../packages/shared/src/categories.js";
export * from "../../../../packages/shared/src/budgets.js";
export * from "../../../../packages/shared/src/transactions.js";
