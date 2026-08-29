import type { ReactNode } from "react";
import { InboxIcon } from "./icons.js";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border-strong bg-surface/40 px-6 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-raised text-text-muted">
        {icon ?? <InboxIcon size={26} />}
      </div>
      <div>
        <p className="text-sm font-semibold text-text-primary">{title}</p>
        {description ? (
          <p className="mx-auto mt-1 max-w-sm text-sm text-text-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
