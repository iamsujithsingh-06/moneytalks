import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padded?: boolean;
  interactive?: boolean;
}

export function Card({
  children,
  padded = true,
  interactive = false,
  className = "",
  ...rest
}: CardProps) {
  return (
    <div
      {...rest}
      className={[
        "rounded-lg border border-border bg-surface shadow-card",
        padded ? "p-4 sm:p-5" : "",
        interactive
          ? "cursor-pointer transition-all duration-150 hover:border-[var(--mt-accent-primary-strong)] hover:-translate-y-0.5"
          : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {subtitle ? (
          <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
