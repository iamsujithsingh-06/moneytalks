import { NavLink, Outlet, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../../state/auth-context.js";
import { Logo } from "../ui/Logo.js";
import { LogoutIcon } from "../ui/icons.js";
import { NAV_ITEMS } from "./nav.js";

const lingo =
  "rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 ";

function navClass({ isActive }: { isActive: boolean }): string {
  return (
    lingo +
    (isActive
      ? "bg-primary-soft text-primary"
      : "text-text-secondary hover:bg-raised hover:text-text-primary")
  );
}

export function AppShell() {
  const location = useLocation();
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-full">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-surface lg:flex">
        <div className="px-5 py-5">
          <Logo />
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.path} to={item.path} className={navClass} end={item.path === "/dashboard"}>
              <span className="flex items-center gap-3">
                <item.icon size={18} />
                {item.label}
              </span>
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <div className="mb-1 px-3 text-xs text-text-muted">
            {user ? user.email : "Signed out"}
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-raised hover:text-text-primary"
          >
            <LogoutIcon size={18} />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-h-full w-full flex-col lg:pl-60">
        <TopBar />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 sm:px-6 lg:pb-10">
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface/95 backdrop-blur lg:hidden">
        {NAV_ITEMS.map((item) => {
          const active = location.pathname === item.path;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/dashboard"}
              className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium"
            >
              <item.icon size={20} className={active ? "text-primary" : "text-text-muted"} />
              <span className={active ? "text-primary" : "text-text-muted"}>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}

function TopBar() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="lg:hidden">
          <Logo showText={false} />
        </div>
        <div className="hidden text-sm text-text-muted lg:block">
          {/* reserved for page context / breadcrumb */}
          <Breadcrumb />
        </div>
        <div className="flex items-center gap-3">
          <ActionHint />
        </div>
      </div>
    </header>
  );
}

function Breadcrumb() {
  const { pathname } = useLocation();
  const current = NAV_ITEMS.find((i) => pathname.startsWith(i.path));
  return <span className="font-medium text-text-primary">{current?.label ?? "MoneyTalks"}</span>;
}

function ActionHint(): ReactNode {
  const { pathname } = useLocation();
  const map: Record<string, string> = {
    "/transactions": "Track income & expenses",
    "/budgets": "Keep spending in check",
    "/analytics": "Understand your money",
    "/settings": "Account preferences",
    "/dashboard": "Today's overview",
  };
  const text = Object.entries(map).find(([p]) => pathname.startsWith(p))?.[1];
  return <span className="hidden text-xs text-text-muted sm:block">{text}</span>;
}
