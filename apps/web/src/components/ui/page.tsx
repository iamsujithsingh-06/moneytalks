import type { ReactNode } from "react";
import { AlertTriangleIcon, InfoIcon } from "./icons.js";
import { Spinner } from "./feedback.js";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

type AlertTone = "error" | "info";

export function Alert({
  tone = "info",
  children,
  action,
}: {
  tone?: AlertTone;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={[
        "flex items-start gap-3 rounded-md border px-4 py-3 text-sm",
        tone === "error"
          ? "border-[var(--mt-negative-soft)] bg-negative-soft/40 text-negative"
          : "border-[var(--mt-info-soft)] bg-info-soft/40 text-info",
      ].join(" ")}
    >
      <span className="mt-0.5 shrink-0">
        {tone === "error" ? <AlertTriangleIcon size={18} /> : <InfoIcon size={18} />}
      </span>
      <div className="flex-1">{children}</div>
      {action}
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  retry?: () => void;
}

export function ErrorState({ message, retry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface px-6 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-negative-soft text-negative">
        <AlertTriangleIcon size={24} />
      </span>
      <div>
        <p className="text-sm font-semibold text-text-primary">Couldn't load this</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-text-muted">{message}</p>
      </div>
      {retry ? (
        <button
          type="button"
          onClick={retry}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-4 text-sm font-medium text-text-primary transition-colors hover:bg-raised"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-3 text-text-muted">
      <Spinner size={26} />
      <span className="text-sm">{label}</span>
    </div>
  );
}
