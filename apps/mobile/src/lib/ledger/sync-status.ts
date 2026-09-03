import { getPendingOps } from "../offline/index.js";

export type TransactionSyncStatus = "synced" | "pending" | "failed" | "conflict";

/**
 * Per-transaction sync status derived from the offline outbox.
 * - A pending/in-flight op → "pending" (awaiting push)
 * - A rejected/failed op → "failed" (needs attention, e.g. conflict)
 * - No matching op → "synced"
 * Conflicting/rejected changes are stored in outbox ops with status "failed",
 * so they surface here as "failed" (mapped to "Needs attention" in the UI).
 */
export async function transactionSyncStatus(
  clientId: string,
): Promise<TransactionSyncStatus> {
  if (!clientId) return "synced";
  const ops = (await getPendingOps()).filter((o) => o.clientId === clientId);
  if (ops.some((o) => o.status === "failed")) return "failed";
  if (ops.length > 0) return "pending";
  return "synced";
}

export const transactionSyncStatusLabel: Record<TransactionSyncStatus, string> = {
  synced: "Synced",
  pending: "Awaiting sync",
  failed: "Needs attention",
  conflict: "Needs attention",
};

export const transactionSyncStatusTone: Record<
  TransactionSyncStatus,
  "positive" | "warning" | "secondary"
> = {
  synced: "positive",
  pending: "secondary",
  failed: "warning",
  conflict: "warning",
};
