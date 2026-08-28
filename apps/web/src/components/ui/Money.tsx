import type { HTMLAttributes } from "react";
import { formatMoney } from "../../lib/format.js";
import { ArrowDownIcon, ArrowUpIcon } from "./icons.js";

interface MoneyProps extends HTMLAttributes<HTMLSpanElement> {
  amountMinor: number;
  currency: string;
  /** Always render an explicit +/- sign. */
  signed?: boolean;
  /** Render an up/down arrow icon next to the figure. */
  withIcon?: boolean;
  /** Override text color (e.g., always white on a gradient hero card). */
  tone?: "positive" | "negative" | "inherit";
  size?: "sm" | "md" | "lg" | "xl";
}

export function Money({
  amountMinor,
  currency,
  signed = false,
  withIcon = false,
  tone = "inherit",
  size = "md",
  className = "",
  ...rest
}: MoneyProps) {
  const positive = amountMinor > 0;
  const negative = amountMinor < 0;
  const sign = signed && !negative ? "always" : "never";

  const toneClass =
    tone === "positive"
      ? "text-positive"
      : tone === "negative"
        ? "text-negative"
        : negative
          ? "text-negative"
          : positive && signed
            ? "text-positive"
            : "text-text-primary";

  const sizeClass =
    size === "sm"
      ? "text-sm"
      : size === "lg"
        ? "text-2xl sm:text-3xl"
        : size === "xl"
          ? "text-4xl sm:text-5xl"
          : "text-base";

  return (
    <span
      {...rest}
      className={[
        "tabular-nums font-numeric tracking-tight font-semibold",
        toneClass,
        sizeClass,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {withIcon && signed ? (
        <span
          className={[
            "mr-1.5 inline-flex h-5 w-5 -translate-y-px items-center justify-center rounded-full",
            negative ? "bg-negative-soft text-negative" : "bg-positive-soft text-positive",
          ].join(" ")}
        >
          {negative ? <ArrowDownIcon size={14} /> : <ArrowUpIcon size={14} />}
        </span>
      ) : null}
      {formatMoney(amountMinor, currency, { sign })}
    </span>
  );
}
