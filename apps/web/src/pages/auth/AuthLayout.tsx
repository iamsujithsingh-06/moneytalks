import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Logo } from "../../components/ui/Logo.js";

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
    <div className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <div className="scale-125">
            <Logo size="lg" />
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-card sm:p-8">
          <h1 className="text-xl font-bold tracking-tight text-text-primary">{title}</h1>
          <p className="mt-1 text-sm text-text-muted">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
        <div className="mt-6 text-center text-sm text-text-muted">{footer}</div>
      </div>
    </div>
  );
}

export const AuthLink = ({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) => (
  <Link to={to} className="font-medium text-primary hover:text-primary-strong">
    {children}
  </Link>
);
