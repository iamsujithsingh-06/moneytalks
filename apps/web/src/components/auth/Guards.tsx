import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../state/auth-context.js";
import { LoadingBlock } from "../ui/page.js";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, status } = useAuth();
  const location = useLocation();
  if (status === "loading") {
    return (
      <div className="flex min-h-full items-center justify-center">
        <LoadingBlock label="Loading your data…" />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

export function GuestOnly({ children }: { children: ReactNode }) {
  const { user, status } = useAuth();
  if (status === "loading") {
    return (
      <div className="flex min-h-full items-center justify-center">
        <LoadingBlock label="Loading…" />
      </div>
    );
  }
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
