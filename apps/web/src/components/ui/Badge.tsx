import type { ReactNode } from "react";

type Tone = "neutral" | "primary" | "positive" | "negative" | "warning" | "info" | "secondary";

interface BadgeProps {
  children: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  className?: string;
}

const toneClasses: Record<Tone, string> = {
  neutral: "bg-raised text-text-secondary border-border",
  primary: "bg-primary-soft text-primary border-[var(--mt-accent-primary-soft)]",
  positive: "bg-positive-soft text-positive border-[var(--mt-positive-soft)]",
  negative: "bg-negative-soft text-negative border-[var(--mt-negative-soft)]",
  warning: "bg-warning-soft text-warning border-[var(--mt-warning-soft)]",
  info: "bg-info-soft text-info border-[var(--mt-info-soft)]",
  secondary: "bg-secondary-soft text-secondary border-[var(--mt-accent-secondary-soft)]",
};

export function Badge({ children, tone = "neutral", icon, className = "" }: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        toneClasses[tone],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {icon}
      {children}
    </span>
  );
}
