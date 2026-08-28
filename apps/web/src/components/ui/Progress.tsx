type ProgressTone = "ok" | "warning" | "over" | "primary" | "positive" | "negative";

interface ProgressProps {
  /** 0..100 (clamped). */
  percent: number;
  tone?: ProgressTone;
  className?: string;
}

const toneColor: Record<ProgressTone, string> = {
  ok: "bg-positive",
  warning: "bg-warning",
  over: "bg-negative",
  primary: "bg-primary",
  positive: "bg-positive",
  negative: "bg-negative",
};

export function ProgressBar({
  percent,
  tone = "primary",
  className = "",
}: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`h-1.5 w-full overflow-hidden rounded-full bg-raised ${className}`}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-300 ${toneColor[tone]}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

interface ProgressRingProps extends ProgressProps {
  size?: number;
  stroke?: number;
  label?: string;
}

export function ProgressRing({
  percent,
  tone = "primary",
  size = 96,
  stroke = 9,
  label,
  className = "",
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--mt-bg-surface-raised)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={ringStroke(tone)}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 300ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`tabular-nums text-lg font-bold text-text-primary`}>
          {label ?? `${Math.round(clamped)}%`}
        </span>
      </div>
    </div>
  );
}

function ringStroke(tone: ProgressTone): string {
  const map: Record<ProgressTone, string> = {
    ok: "var(--mt-positive)",
    warning: "var(--mt-warning)",
    over: "var(--mt-negative)",
    primary: "var(--mt-accent-primary)",
    positive: "var(--mt-positive)",
    negative: "var(--mt-negative)",
  };
  return map[tone];
}
