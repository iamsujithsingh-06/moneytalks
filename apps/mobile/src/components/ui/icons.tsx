import type { ReactElement, ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };
type BaseProps = Omit<IconProps, "size"> & { size?: number; children: ReactNode };

function IconBase({ size = 20, ...props }: BaseProps): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export function ArrowDownIcon({ size, ...p }: IconProps) {
  return (
    <IconBase size={size} {...p}>
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
    </IconBase>
  );
}

export function ChevronLeftIcon({ size, ...p }: IconProps) {
  return (
    <IconBase size={size} {...p}>
      <path d="m15 18-6-6 6-6" />
    </IconBase>
  );
}

export function ArrowUpIcon({ size, ...p }: IconProps) {
  return (
    <IconBase size={size} {...p}>
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </IconBase>
  );
}

export function InboxIcon({ size, ...p }: IconProps) {
  return (
    <IconBase size={size} {...p}>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </IconBase>
  );
}

export function CheckIcon({ size, ...p }: IconProps) {
  return (
    <IconBase size={size} {...p}>
      <path d="M20 6 9 17l-5-5" />
    </IconBase>
  );
}

export function XIcon({ size, ...p }: IconProps) {
  return (
    <IconBase size={size} {...p}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </IconBase>
  );
}

export function AlertIcon({ size, ...p }: IconProps) {
  return (
    <IconBase size={size} {...p}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </IconBase>
  );
}

export function ShieldIcon({ size, ...p }: IconProps) {
  return (
    <IconBase size={size} {...p}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </IconBase>
  );
}

export function PencilIcon({ size, ...p }: IconProps) {
  return (
    <IconBase size={size} {...p}>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </IconBase>
  );
}

export function MessageIcon({ size, ...p }: IconProps) {
  return (
    <IconBase size={size} {...p}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </IconBase>
  );
}

export function CameraIcon({ size, ...p }: IconProps) {
  return (
    <IconBase size={size} {...p}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </IconBase>
  );
}

export function PasteIcon({ size, ...p }: IconProps) {
  return (
    <IconBase size={size} {...p}>
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </IconBase>
  );
}

export function PlusIcon({ size, ...p }: IconProps) {
  return (
    <IconBase size={size} {...p}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </IconBase>
  );
}

export function SettingsIcon({ size, ...p }: IconProps) {
  return (
    <IconBase size={size} {...p}>
      <path d="M4 12.5v-1l1.6-.3a7 7 0 0 0 .6-1.4l-.9-1.3 1-1 .9.9a7 7 0 0 0 1.4-.6l.3-1.6h1.4l.3 1.6a7 7 0 0 0 1.4.6l.9-.9 1 1-.9 1.3a7 7 0 0 0 .6 1.4l1.6.3v1l-1.6.3a7 7 0 0 0-.6 1.4l.9 1.3-1 1-.9-.9a7 7 0 0 0-1.4.6l-.3 1.6h-1.4l-.3-1.6a7 7 0 0 0-1.4-.6l-.9.9-1-1 .9-1.3a7 7 0 0 0-.6-1.4z" />
      <circle cx="12" cy="12" r="2.6" />
    </IconBase>
  );
}

export function WalletIcon({ size, ...p }: IconProps) {
  return (
    <IconBase size={size} {...p}>
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </IconBase>
  );
}

export function RefreshIcon({ size, ...p }: IconProps) {
  return (
    <IconBase size={size} {...p}>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </IconBase>
  );
}

export function HandCoinsIcon({ size, ...p }: IconProps) {
  return (
    <IconBase size={size} {...p}>
      <path d="M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17" />
      <path d="m7 21 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9" />
      <path d="m2 11 6-5" />
      <path d="m16 3 1.5 1.5" />
      <path d="m11 2 2 2" />
    </IconBase>
  );
}

export function BarChartIcon({ size, ...p }: IconProps) {
  return (
    <IconBase size={size} {...p}>
      <path d="M3 3v18h18" />
      <path d="M7 16V8" />
      <path d="M11 16V11" />
      <path d="M15 16V5" />
    </IconBase>
  );
}
