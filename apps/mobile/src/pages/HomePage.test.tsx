import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HomePage } from "./HomePage.js";
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
    source: partial.source ?? "manual",
    status: "confirmed",
    amountMinor: partial.amountMinor,
    currency: "INR",
    transactionDate: partial.transactionDate,
    merchant: partial.merchant ?? null,
    counterparty: partial.counterparty ?? null,
    note: partial.note ?? null,
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
    updatedAt: partial.updatedAt ?? `${partial.transactionDate}T00:00:00.000Z`,
    rev: 1,
  };
}

const RECENT: TransactionPublic[] = [
  tx({
    id: "1",
    clientId: "c1",
    type: "expense",
    source: "sms",
    amountMinor: 200000,
    transactionDate: "2026-09-05",
    merchant: "SWIGGY",
    autoDetected: true,
  }),
  tx({
    id: "2",
    clientId: "c2",
    type: "income",
    source: "manual",
    amountMinor: 500000,
    direction: "inflow",
    transactionDate: "2026-09-01",
    counterparty: "Aarav Patel",
  }),
];

const useLedgerMock = vi.fn();

vi.mock("../state/ledger-context.js", () => ({
  useLedger: (...args: unknown[]) => useLedgerMock(...args),
}));

vi.mock("../state/sms-context.js", () => ({
  useSms: () => ({ capturedCount: 0 }),
}));

vi.mock("../state/sync-context.js", () => ({
  useSync: () => ({
    snapshot: { status: "synced", online: true, syncing: false, pendingCount: 0, retryable: false, conflictCount: 0, lastSyncAt: null, error: null, issues: [] },
    triggerSync: () => undefined,
    resolveKeepMine: () => undefined,
    resolveKeepTheirs: () => undefined,
    clearIssues: () => undefined,
  }),
}));

function setupLedger() {
  useLedgerMock.mockReturnValue({
    data: {
      balance: 300000,
      monthIncome: 500000,
      monthExpense: 200000,
      net: 300000,
      todayCount: 0,
      todayOutflow: 0,
      topSpend: [],
      recent: RECENT,
      pendingSyncCount: 0,
    },
    transactions: RECENT,
    loading: false,
    refresh: async () => undefined,
    addManual: async () => ({ ok: true as const, clientId: "c" }),
  });
}

describe("HomePage recent transactions", () => {
  it("uses the same shared presentation as the transactions list", () => {
    setupLedger();
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );
    // Party name as primary title
    expect(screen.getByText("SWIGGY")).toBeInTheDocument();
    expect(screen.getByText("Aarav Patel")).toBeInTheDocument();
    // Signed amounts (scoped to the recent rows to avoid the balance summary)
    expect(within(screen.getByRole("link", { name: /SWIGGY/i })).getByText(/−₹2,000\.00/)).toBeInTheDocument();
    expect(within(screen.getByRole("link", { name: /Aarav Patel/i })).getByText(/\+₹5,000\.00/)).toBeInTheDocument();
    // Direction line
    expect(screen.getByText("Sent to SWIGGY")).toBeInTheDocument();
    expect(screen.getByText("Received from Aarav Patel")).toBeInTheDocument();
    // Date • time
    expect(screen.getByText(/5 Sept 2026/)).toBeInTheDocument();
    // Auto/Manual • payment method
    expect(screen.getByText(/Auto • UPI/i)).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });

  it("navigates to the transaction details page when a recent row is tapped", () => {
    setupLedger();
    render(
      <MemoryRouter initialEntries={["/home"]}>
        <Routes>
          <Route path="/home" element={<HomePage />} />
          <Route path="/transactions/:transactionId" element={<div>DETAILS PAGE</div>} />
        </Routes>
      </MemoryRouter>,
    );
    const row = screen.getByRole("link", { name: /SWIGGY/i });
    expect(row).toHaveAttribute("href", "/transactions/c1");
    fireEvent.click(row);
    expect(screen.getByText("DETAILS PAGE")).toBeInTheDocument();
  });
});
