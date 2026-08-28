import type {
  CreateBudgetInput,
  UpdateBudgetInput,
} from "@moneytalks/validation";

export type {
  BudgetListQuery,
  BudgetParams,
  BudgetSummaryQuery,
  CreateBudgetData,
  CreateBudgetInput,
  UpdateBudgetData,
  UpdateBudgetInput,
} from "@moneytalks/validation";

export type BudgetCreateRequest = CreateBudgetInput;
export type BudgetUpdateRequest = UpdateBudgetInput;

export interface BudgetAlertThresholdsPublic {
  warningPct: number;
  hardPct: number;
}

export interface BudgetPublic {
  id: string;
  userId: string;
  clientId: string;
  categoryId: string | null;
  scope: string;
  period: string;
  periodAnchor: string | null;
  allocatedMinor: number;
  currency: string;
  rollover: boolean;
  status: string;
  alertThresholds: BudgetAlertThresholdsPublic;
  spentMinor: number;
  percent: number;
  alertStatus: string;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
  rev: number;
}

export interface BudgetSummary {
  totalAllocatedMinor: number;
  totalSpentMinor: number;
  percent: number;
  counts: {
    ok: number;
    warning: number;
    over: number;
  };
  budgets: BudgetPublic[];
}
