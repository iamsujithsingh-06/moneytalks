import type { ComponentType, SVGProps } from "react";
import {
  AnalyticsIcon,
  BudgetsIcon,
  DashboardIcon,
  SettingsIcon,
  TransactionsIcon,
} from "../ui/icons.js";

export interface NavItem {
  path: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
}

export const NAV_ITEMS: NavItem[] = [
  { path: "/dashboard", label: "Dashboard", icon: DashboardIcon },
  { path: "/transactions", label: "Transactions", icon: TransactionsIcon },
  { path: "/budgets", label: "Budgets", icon: BudgetsIcon },
  { path: "/analytics", label: "Analytics", icon: AnalyticsIcon },
  { path: "/settings", label: "Settings", icon: SettingsIcon },
];
