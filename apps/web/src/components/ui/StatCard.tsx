import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "positive" | "negative" | "neutral";
}

export function StatCard({ label, value, icon, sub, tone = "default" }: StatCardProps) {
  const iconTone =
    tone === "positive"
      ? "bg-positive-soft text-positive"
      : tone === "negative"
        ? "bg-negative-soft text-negative"
        : tone === "neutral"
          ? "bg-raised text-secondary"
          : "bg-primary-soft text-primary";
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</p>
        {icon ? (
          <span className={`flex h-8 w-8 items-center justify-center rounded-full ${iconTone}`}>
            {icon}
          </span>
        ) : null}
      </div>
      <div className="mt-2 font-numeric text-2xl font-bold tabular-nums tracking-tight">
        {value}
      </div>
      {sub ? <div className="mt-1 text-xs text-text-muted">{sub}</div> : null}
    </div>
  );
}
