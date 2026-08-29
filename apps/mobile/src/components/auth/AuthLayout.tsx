import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-8 text-center">
        <p className="text-2xl font-bold text-text-primary">
          Money<span className="text-primary">Talks</span>
        </p>
        <p className="mt-1 text-sm text-text-muted">Automatic money tracking from your messages.</p>
      </div>
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
        <h1 className="text-xl font-bold tracking-tight text-text-primary">{title}</h1>
        <p className="mt-1 text-sm text-text-muted">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </div>
      <div className="mt-6 text-center text-sm text-text-muted">{footer}</div>
    </div>
  );
}

export const AuthLink = ({ to, children }: { to: string; children: ReactNode }) => (
  <Link to={to} className="font-medium text-primary">
    {children}
  </Link>
);
