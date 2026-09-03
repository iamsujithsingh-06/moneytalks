import { NavLink, Outlet } from "react-router-dom";
import { useSms } from "../../state/sms-context.js";
import { useOcr } from "../../state/ocr-context.js";
import {
  BarChartIcon,
  CameraIcon,
  InboxIcon,
  MessageIcon,
  PlusIcon,
  SettingsIcon,
  WalletIcon,
} from "../ui/icons.js";

const navItems = [
  { to: "/home", label: "Home", icon: WalletIcon, end: true },
  { to: "/transactions", label: "Transactions", icon: MessageIcon, end: false },
  { to: "/analysis", label: "Analysis", icon: BarChartIcon, end: false },
  { to: "/add", label: "Add", icon: PlusIcon, end: false },
  { to: "/reviews", label: "Review", icon: InboxIcon, end: false },
  { to: "/receipts", label: "Receipts", icon: CameraIcon, end: false },
  { to: "/settings", label: "Settings", icon: SettingsIcon, end: false },
];

export function AppShell() {
  const { capturedCount } = useSms();
  const { capturedCount: receiptCount } = useOcr();

  function badgeCount(to: string): number {
    if (to === "/reviews") return capturedCount;
    if (to === "/receipts") return receiptCount;
    return 0;
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-canvas/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-xl items-center justify-between">
          <span className="text-lg font-bold tracking-tight text-text-primary">
            Money<span className="text-primary">Talks</span>
          </span>
          <span className="text-xs font-medium text-text-muted">SMS capture</span>
        </div>
      </header>

      <main className="flex-1 pb-24">
        <Outlet />
      </main>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="mx-auto flex w-full max-w-xl items-stretch justify-around">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  [
                    "relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors",
                    isActive ? "text-primary" : "text-text-muted hover:text-text-secondary",
                  ].join(" ")
                }
              >
                  {({ isActive }) => {
                    const count = badgeCount(item.to);
                    return (
                      <>
                        <span
                          className={
                            isActive
                              ? "absolute top-0 h-0.5 w-8 rounded-full bg-primary"
                              : "hidden"
                          }
                        />
                        <span className="relative">
                          <Icon size={22} />
                          {count > 0 ? (
                            <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-[#0b0b12]">
                              {count > 99 ? "99+" : count}
                            </span>
                          ) : null}
                        </span>
                        {item.label}
                      </>
                    );
                  }}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
