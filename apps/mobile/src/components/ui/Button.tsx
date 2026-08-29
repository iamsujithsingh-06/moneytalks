import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-primary text-[#0b0b12] font-semibold hover:bg-primary-strong active:scale-[0.98] shadow-[0_8px_24px_rgba(45,212,191,0.25)]",
  secondary:
    "bg-primary-soft text-primary hover:bg-[var(--mt-accent-primary-soft)]/70 active:scale-[0.98]",
  ghost:
    "bg-transparent text-text-secondary hover:bg-raised hover:text-text-primary active:scale-[0.98]",
  outline:
    "border border-border-strong bg-transparent text-text-primary hover:border-[var(--mt-accent-primary)] hover:text-primary active:scale-[0.98]",
  danger:
    "bg-negative-soft text-negative hover:bg-[var(--mt-negative)]/25 active:scale-[0.98]",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-11 px-3 text-sm gap-1.5",
  md: "h-12 px-4 text-sm gap-2",
  lg: "h-14 px-6 text-base gap-2",
  icon: "h-12 w-12",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth = false,
  leftIcon,
  className = "",
  children,
  disabled,
  type,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type ?? "button"}
      disabled={disabled || loading}
      {...rest}
      className={[
        "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mt-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        "disabled:opacity-50 disabled:pointer-events-none select-none",
        variantClasses[variant],
        sizeClasses[size],
        fullWidth ? "w-full" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span className="sr-only">Loading</span>
        </span>
      ) : (
        <>
          {leftIcon}
          {children}
        </>
      )}
    </button>
  );
}
