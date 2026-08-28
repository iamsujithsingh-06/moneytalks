import { WalletIcon } from "./icons.js";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
}

export function Logo({ size = "md", showText = true }: LogoProps) {
  const box = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-11 w-11" : "h-9 w-9";
  const icon = size === "sm" ? 18 : size === "lg" ? 26 : 22;
  const text = size === "sm" ? "text-base" : "text-lg";
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-strong text-white shadow-card ${box}`}
      >
        <WalletIcon size={icon} />
      </span>
      {showText ? (
        <span className={`font-semibold tracking-tight text-text-primary ${text}`}>
          Money<span className="text-primary">Talks</span>
        </span>
      ) : null}
    </div>
  );
}
