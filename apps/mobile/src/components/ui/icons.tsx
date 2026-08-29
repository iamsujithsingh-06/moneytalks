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

export function PasteIcon({ size, ...p }: IconProps) {
  return (
    <IconBase size={size} {...p}>
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </IconBase>
  );
}
