import type { ReactNode } from "react";
import { AlertIcon } from "./icons.js";

/** Full-screen centered loading state for a page. */
export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-text-muted">
      <span className="h-7 w-7 animate-spin rounded-full border-2 border-border-strong border-t-primary" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

/** Inline card used to surface a load/operation error with a retry action. */
export function ErrorCard({
  title = "Something went wrong",
  message,
  onRetry,
  children,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-negative-soft bg-negative-soft/30 p-4"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-negative">
          <AlertIcon size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-negative">{title}</p>
          {message ? <p className="mt-1 text-sm text-text-secondary">{message}</p> : null}
          {children ? <div className="mt-3">{children}</div> : null}
        </div>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 ml-8 inline-flex h-10 items-center justify-center rounded-lg border border-border-strong bg-surface px-4 text-sm font-medium text-text-primary hover:border-primary hover:text-primary"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
