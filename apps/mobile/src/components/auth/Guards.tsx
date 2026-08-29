import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../state/auth-context.js";
import { PageLoader } from "../ui/feedback.js";

/** Protect authenticated screens. Redirects to /login when signed out. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, status } = useAuth();
  const location = useLocation();
  if (status === "loading") {
    return <PageLoader label="Loading your data…" />;
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

/** Show a screen only to signed-out users. Redirects away when signed in. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { user, status } = useAuth();
  if (status === "loading") {
    return <PageLoader label="Loading…" />;
  }
  if (user) return <Navigate to="/home" replace />;
  return <>{children}</>;
}
