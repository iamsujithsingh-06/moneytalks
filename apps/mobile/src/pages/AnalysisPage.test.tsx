import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnalysisPage } from "./AnalysisPage.js";
import type { TransactionPublic } from "@moneytalks/types";

function tx(
  partial: Partial<TransactionPublic> & {
    amountMinor: number;
    type: string;
    transactionDate: string;
  },
): TransactionPublic {
  return {
    id: partial.id ?? "id",
    userId: "u",
    clientId: partial.clientId ?? "c",
    type: partial.type,
    direction: (partial.direction as string) ?? null,
    source: "manual",
    status: "confirmed",
    amountMinor: partial.amountMinor,
    currency: "INR",
    transactionDate: partial.transactionDate,
    merchant: partial.merchant ?? null,
    counterparty: null,
    note: null,
    tags: [],
    categoryId: null,
    paymentMethodId: null,
    accountRef: null,
    confidence: null,
    autoDetected: false,
    duplicateOf: null,
    duplicateGroup: null,
    editedCount: 0,
    createdAt: `${partial.transactionDate}T00:00:00.000Z`,
    updatedAt: `${partial.transactionDate}T00:00:00.000Z`,
    rev: 1,
  };
}

const SEP_TXNS: TransactionPublic[] = [
  tx({ id: "1", type: "income", amountMinor: 500000, direction: "inflow", transactionDate: "2026-09-01" }),
  tx({ id: "2", type: "expense", amountMinor: 200000, transactionDate: "2026-09-05", merchant: "Rent" }),
  tx({ id: "3", type: "expense", amountMinor: 100000, transactionDate: "2026-09-10", merchant: "Groceries" }),
];

const useLedgerMock = vi.fn();

vi.mock("../state/ledger-context.js", () => ({
  useLedger: (...args: unknown[]) => useLedgerMock(...args),
}));

function setupFullLedger() {
  useLedgerMock.mockReturnValue({
    data: {
      balance: 200000,
      monthIncome: 500000,
      monthExpense: 300000,
      net: 200000,
      todayCount: 0,
      todayOutflow: 0,
      topSpend: [],
      recent: [],
      pendingSyncCount: 0,
    },
    transactions: SEP_TXNS,
    loading: false,
    refresh: async () => undefined,
    addManual: async () => ({ ok: true as const, clientId: "c" }),
  });
}

function setupEmptyLedger() {
  useLedgerMock.mockReturnValue({
    data: {
      balance: 0,
      monthIncome: 0,
      monthExpense: 0,
      net: 0,
      todayCount: 0,
      todayOutflow: 0,
      topSpend: [],
      recent: [],
      pendingSyncCount: 0,
    },
    transactions: [],
    loading: false,
    refresh: async () => undefined,
    addManual: async () => ({ ok: true as const, clientId: "c" }),
  });
}

describe("AnalysisPage", () => {
  it("renders summary metric cards and sections", () => {
    setupFullLedger();
    render(<AnalysisPage />);
    expect(screen.getByRole("heading", { name: /analysis/i })).toBeInTheDocument();
    expect(screen.getAllByText(/income/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/expenses/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/net savings/i)).toBeInTheDocument();
    expect(screen.getByText(/spending trend/i)).toBeInTheDocument();
    expect(screen.getByText(/top categories/i)).toBeInTheDocument();
    expect(screen.getByText(/category breakdown/i)).toBeInTheDocument();
    expect(screen.getByText(/previous monthly comparison/i)).toBeInTheDocument();
  });

  it("defaults to monthly and lets the user toggle weekly", async () => {
    setupFullLedger();
    const user = userEvent.setup();
    render(<AnalysisPage />);
    const monthlyTab = screen.getByRole("tab", { name: /monthly/i });
    const weeklyTab = screen.getByRole("tab", { name: /weekly/i });
    expect(monthlyTab).toHaveAttribute("aria-selected", "true");

    await user.click(weeklyTab);
    expect(weeklyTab).toHaveAttribute("aria-selected", "true");
    expect(monthlyTab).toHaveAttribute("aria-selected", "false");
  });

  it("shows the highest spending day when there is spending", () => {
    setupFullLedger();
    render(<AnalysisPage />);
    expect(screen.getByText(/highest spending day/i)).toBeInTheDocument();
  });

  it("renders data-driven insights", () => {
    setupFullLedger();
    render(<AnalysisPage />);
    expect(screen.getByText(/biggest spend/i)).toBeInTheDocument();
  });

  it("renders the bar chart", () => {
    setupFullLedger();
    render(<AnalysisPage />);
    expect(screen.getByRole("img", { name: /spending trend bar chart/i })).toBeInTheDocument();
  });

  it("shows the empty state when there are no transactions in the period", () => {
    setupEmptyLedger();
    render(<AnalysisPage />);
    expect(screen.getByText(/no transactions this monthly/i)).toBeInTheDocument();
  });
});
