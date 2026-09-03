import type { SyncStatusValue } from "@moneytalks/offline";

const labels: Record<SyncStatusValue, string> = {
  synced: "Synced",
  pending: "Pending sync",
  syncing: "Syncing…",
  failed: "Sync error",
  conflict: "Needs attention",
  offline: "Offline",
};

export function syncStatusLabel(status: SyncStatusValue): string {
  return labels[status] ?? "Unknown";
}
