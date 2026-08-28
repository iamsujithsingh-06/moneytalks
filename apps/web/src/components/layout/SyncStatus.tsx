import { useState } from "react";
import type { SyncEntity } from "@moneytalks/types";
import { useSync } from "../../state/sync-context.js";
import { useOnline } from "../../hooks/useOnline.js";
import type { SyncStatusValue } from "../../lib/offline/index.js";
import { Badge } from "../ui/Badge.js";
import { Button } from "../ui/Button.js";

const STATUS_META: Record<
  SyncStatusValue,
  { label: string; tone: "neutral" | "positive" | "negative" | "warning" | "info"; dot: string }
> = {
  synced: { label: "Synced", tone: "positive", dot: "bg-positive" },
  pending: { label: "Pending", tone: "warning", dot: "bg-warning" },
  syncing: { label: "Syncing…", tone: "info", dot: "bg-info" },
  failed: { label: "Sync failed", tone: "negative", dot: "bg-negative" },
  conflict: { label: "Review needed", tone: "negative", dot: "bg-negative" },
  offline: { label: "Offline", tone: "neutral", dot: "bg-text-muted" },
};

export function SyncStatus() {
  const { snapshot, triggerSync, resolveKeepMine, resolveKeepTheirs } = useSync();
  const online = useOnline();
  const [open, setOpen] = useState(false);

  const meta = STATUS_META[snapshot.status];
  const showCount = snapshot.pendingCount > 0 || snapshot.conflictCount > 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-raised"
        aria-label="Sync status"
      >
        <span className={`h-2 w-2 rounded-full ${meta.dot} ${snapshot.syncing ? "animate-pulse" : ""}`} />
        <span className="hidden sm:inline">{online ? meta.label : "Offline"}</span>
        {showCount ? (
          <Badge tone={snapshot.conflictCount > 0 ? "negative" : "warning"}>
            {snapshot.conflictCount > 0 ? snapshot.conflictCount : snapshot.pendingCount}
          </Badge>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-40 mt-2 w-80 rounded-xl border border-border bg-surface p-4 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">Sync</h3>
            <button
              type="button"
              className="text-xs text-text-muted hover:text-text-primary"
              onClick={() => setOpen(false)}
              aria-label="Close sync panel"
            >
              Close
            </button>
          </div>

          <dl className="space-y-1 text-xs text-text-secondary">
            <div className="flex justify-between">
              <dt>Status</dt>
              <dd>{meta.label}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Pending changes</dt>
              <dd>{snapshot.pendingCount}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Last synced</dt>
              <dd>
                {snapshot.lastSyncAt
                  ? new Date(snapshot.lastSyncAt).toLocaleTimeString()
                  : "Never"}
              </dd>
            </div>
          </dl>

          {snapshot.error ? (
            <p className="mt-2 rounded-lg bg-negative-soft/50 px-3 py-2 text-xs text-negative">
              {snapshot.error}
            </p>
          ) : null}

          {snapshot.issues.length > 0 ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-medium text-text-secondary">
                {snapshot.issues.length} change{snapshot.issues.length === 1 ? "" : "s"} need your attention
              </p>
              {snapshot.issues.map((issue) => (
                <IssueRow
                  key={`${issue.entity}:${issue.clientId}`}
                  entity={issue.entity}
                  kind={issue.kind}
                  reason={issue.reason}
                  clientId={issue.clientId}
                  onKeepMine={() => void resolveKeepMine(issue.entity, issue.clientId)}
                  onKeepTheirs={() => void resolveKeepTheirs(issue.entity, issue.clientId)}
                />
              ))}
            </div>
          ) : null}

          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => void triggerSync()}>
              Sync now
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function IssueRow({
  entity,
  kind,
  reason,
  clientId,
  onKeepMine,
  onKeepTheirs,
}: {
  entity: SyncEntity;
  kind: "conflict" | "rejected";
  reason?: string;
  clientId: string;
  onKeepMine: () => void;
  onKeepTheirs: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-raised/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <Badge tone={kind === "conflict" ? "negative" : "warning"}>{kind}</Badge>
        <span className="truncate text-xs text-text-muted">
          {entity} · {clientId.slice(0, 8)}
        </span>
      </div>
      {reason ? <p className="mt-1 text-xs text-text-secondary">{reason}</p> : null}
      {kind === "conflict" ? (
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="ghost" onClick={onKeepMine}>
            Keep mine
          </Button>
          <Button size="sm" variant="secondary" onClick={onKeepTheirs}>
            Keep theirs
          </Button>
        </div>
      ) : null}
      {kind === "rejected" ? (
        <Button size="sm" variant="ghost" className="mt-2" onClick={onKeepMine}>
          Discard & re-sync
        </Button>
      ) : null}
    </div>
  );
}
