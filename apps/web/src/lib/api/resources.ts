import type {
  AnalyticsCategoriesQuery,
  AnalyticsCashflowQuery,
  AnalyticsSummary,
  AnalyticsSummaryQuery,
  BudgetCreateRequest,
  BudgetListQuery,
  BudgetPublic,
  BudgetUpdateRequest,
  CashflowSeries,
  CategoryBreakdownItem,
  CategoryCreateRequest,
  CategoryPublic,
  CategoryUpdateRequest,
  DashboardSummary,
  PaymentMethodCreateRequest,
  PaymentMethodPublic,
  PaymentMethodUpdateRequest,
  TransactionCreateRequest,
  TransactionListQuery,
  TransactionListResult,
  TransactionPublic,
  TransactionUpdateRequest,
} from "@moneytalks/types";
import type { ApiClient } from "./client.js";

export interface CategoriesApi {
  list(type?: string): Promise<CategoryPublic[]>;
  create(input: CategoryCreateRequest): Promise<CategoryPublic>;
  update(id: string, input: CategoryUpdateRequest): Promise<CategoryPublic>;
  remove(id: string, reassignToId?: string): Promise<void>;
  restoreDefaults(): Promise<CategoryPublic[]>;
}

export interface PaymentMethodsApi {
  list(kind?: string): Promise<PaymentMethodPublic[]>;
  create(input: PaymentMethodCreateRequest): Promise<PaymentMethodPublic>;
  update(id: string, input: PaymentMethodUpdateRequest): Promise<PaymentMethodPublic>;
  remove(id: string): Promise<void>;
}

export interface TransactionsApi {
  list(query: TransactionListQuery): Promise<TransactionListResult>;
  get(id: string): Promise<TransactionPublic>;
  create(input: TransactionCreateRequest): Promise<TransactionPublic>;
  update(id: string, input: TransactionUpdateRequest): Promise<TransactionPublic>;
  remove(id: string): Promise<void>;
}

export interface BudgetsApi {
  list(query?: BudgetListQuery): Promise<BudgetPublic[]>;
  create(input: BudgetCreateRequest): Promise<BudgetPublic>;
  update(id: string, input: BudgetUpdateRequest): Promise<BudgetPublic>;
  remove(id: string): Promise<void>;
}

export interface AnalyticsApi {
  summary(query: AnalyticsSummaryQuery): Promise<AnalyticsSummary>;
  cashflow(query: AnalyticsCashflowQuery): Promise<CashflowSeries>;
  categories(query: AnalyticsCategoriesQuery): Promise<{ items: CategoryBreakdownItem[] }>;
}

export interface DashboardApi {
  summary(): Promise<DashboardSummary>;
}

export interface ApiResources {
  categories: CategoriesApi;
  paymentMethods: PaymentMethodsApi;
  transactions: TransactionsApi;
  budgets: BudgetsApi;
  analytics: AnalyticsApi;
  dashboard: DashboardApi;
}

export function attachResources(client: ApiClient): ApiResources {
  const req = <T>(path: string, options?: Parameters<ApiClient["request"]>[1]) =>
    client.request<T>(path, options);

  return {
    categories: {
      list: (type) =>
        req<CategoryPublic[]>("/categories", { query: type ? { type } : undefined }),
      create: (input) =>
        req<CategoryPublic>("/categories", { method: "POST", body: input }),
      update: (id, input) =>
        req<CategoryPublic>(`/categories/${id}`, { method: "PATCH", body: input }),
      remove: (id, reassignToId) =>
        req<void>(`/categories/${id}`, {
          method: "DELETE",
          body: reassignToId ? { reassignToId } : {},
        }),
      restoreDefaults: () =>
        req<CategoryPublic[]>("/categories/defaults", { method: "POST" }),
    },

    paymentMethods: {
      list: (kind) =>
        req<PaymentMethodPublic[]>("/payment-methods", {
          query: kind ? { kind } : undefined,
        }),
      create: (input) =>
        req<PaymentMethodPublic>("/payment-methods", { method: "POST", body: input }),
      update: (id, input) =>
        req<PaymentMethodPublic>(`/payment-methods/${id}`, {
          method: "PATCH",
          body: input,
        }),
      remove: (id) => req<void>(`/payment-methods/${id}`, { method: "DELETE" }),
    },

    transactions: {
      list: (query) =>
        req<TransactionListResult>("/transactions", { query }),
      get: (id) => req<TransactionPublic>(`/transactions/${id}`),
      create: (input) =>
        req<TransactionPublic>("/transactions", { method: "POST", body: input }),
      update: (id, input) =>
        req<TransactionPublic>(`/transactions/${id}`, { method: "PATCH", body: input }),
      remove: (id) => req<void>(`/transactions/${id}`, { method: "DELETE" }),
    },

    budgets: {
      list: (query) => req<BudgetPublic[]>("/budgets", { query }),
      create: (input) => req<BudgetPublic>("/budgets", { method: "POST", body: input }),
      update: (id, input) =>
        req<BudgetPublic>(`/budgets/${id}`, { method: "PATCH", body: input }),
      remove: (id) => req<void>(`/budgets/${id}`, { method: "DELETE" }),
    },

    analytics: {
      summary: (query) => req<AnalyticsSummary>("/analytics/summary", { query }),
      cashflow: (query) => req<CashflowSeries>("/analytics/cashflow", { query }),
      categories: (query) =>
        req<{ items: CategoryBreakdownItem[] }>("/analytics/categories", { query }),
    },

    dashboard: {
      summary: () => req<DashboardSummary>("/dashboard/summary"),
    },
  };
}
