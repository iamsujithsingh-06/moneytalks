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
  /** Override text color. */
  tone?: "positive" | "negative" | "inherit";
  size?: "sm" | "md" | "lg";
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
  const negative = amountMinor < 0;
  const positive = amountMinor > 0;
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
    size === "sm" ? "text-base" : size === "lg" ? "text-3xl" : "text-xl";

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
            "mr-1.5 inline-flex h-6 w-6 -translate-y-px items-center justify-center rounded-full",
            negative ? "bg-negative-soft text-negative" : "bg-positive-soft text-positive",
          ].join(" ")}
        >
          {negative ? <ArrowDownIcon size={16} /> : <ArrowUpIcon size={16} />}
        </span>
      ) : null}
      {formatMoney(amountMinor, currency, { sign })}
    </span>
  );
}
