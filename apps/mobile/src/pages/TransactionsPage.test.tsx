import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TransactionsPage } from "./TransactionsPage.js";
import { TransactionDetailsPage } from "./TransactionDetailsPage.js";
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
    tags: partial.tags ?? [],
    categoryId: partial.categoryId ?? null,
    paymentMethodId: partial.paymentMethodId ?? null,
    accountRef: partial.accountRef ?? null,
    confidence: partial.confidence ?? null,
    autoDetected: partial.autoDetected ?? false,
    duplicateOf: partial.duplicateOf ?? null,
    duplicateGroup: partial.duplicateGroup ?? null,
    editedCount: 0,
    createdAt: `${partial.transactionDate}T00:00:00.000Z`,
    updatedAt: partial.updatedAt ?? `${partial.transactionDate}T00:00:00.000Z`,
    rev: 1,
  };
}

const TXNS: TransactionPublic[] = [
  tx({
    id: "1",
    clientId: "c1",
    type: "expense",
    source: "sms",
    amountMinor: 200000,
    transactionDate: "2026-09-05",
    merchant: "SWIGGY",
    autoDetected: true,
    updatedAt: "2026-09-05T00:00:00.000Z",
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

const useSyncMock = vi.fn();

vi.mock("../state/sync-context.js", () => ({
  useSync: (...args: unknown[]) => useSyncMock(...args),
}));

vi.mock("../lib/ledger/sync-status.js", () => ({
  transactionSyncStatus: async () => "synced",
  transactionSyncStatusLabel: { synced: "Synced", pending: "Awaiting sync", failed: "Needs attention", conflict: "Needs attention" },
  transactionSyncStatusTone: { synced: "positive", pending: "secondary", failed: "warning", conflict: "warning" },
}));

function setupLedger() {
  useLedgerMock.mockReturnValue({
    data: null,
    transactions: TXNS,
    loading: false,
    refresh: async () => undefined,
    addManual: async () => ({ ok: true as const, clientId: "c" }),
  });
  useSyncMock.mockReturnValue({
    snapshot: { status: "synced", online: true, syncing: false, pendingCount: 0, retryable: false, conflictCount: 0, lastSyncAt: null, error: null, issues: [] },
    triggerSync: () => undefined,
    resolveKeepMine: () => undefined,
    resolveKeepTheirs: () => undefined,
    clearIssues: () => undefined,
  });
}

describe("TransactionsPage", () => {
  it("renders transactions with party name as the primary title", () => {
    setupLedger();
    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("SWIGGY")).toBeInTheDocument();
    expect(screen.getByText("Aarav Patel")).toBeInTheDocument();
  });

  it("renders the direction line, source and payment method for each row", () => {
    setupLedger();
    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("Sent to SWIGGY")).toBeInTheDocument();
    expect(screen.getByText("Received from Aarav Patel")).toBeInTheDocument();
    expect(screen.getByText(/Auto • UPI/i)).toBeInTheDocument();
    expect(screen.getAllByText("Manual").length).toBeGreaterThanOrEqual(1);
  });

  it("shows the party name as the primary title and the signed amount", () => {
    setupLedger();
    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );
    // Party name is the primary title.
    expect(screen.getByText("SWIGGY")).toBeInTheDocument();
    expect(screen.getByText("Aarav Patel")).toBeInTheDocument();
    // Signed amounts are rendered.
    expect(screen.getByText(/−₹2,000\.00/)).toBeInTheDocument();
    expect(screen.getByText(/\+₹5,000\.00/)).toBeInTheDocument();
  });

  it("renders the date • time and the Auto/Manual • payment-method line", () => {
    setupLedger();
    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );
    // Date • time for each row
    expect(screen.getByText(/5 Sept 2026/)).toBeInTheDocument();
    expect(screen.getByText(/1 Sept 2026/)).toBeInTheDocument();
    // Auto • payment method for the SMS row, Manual for the manual row
    expect(screen.getByText(/Auto • UPI/i)).toBeInTheDocument();
    // "Manual" appears both as a filter chip and as the row's source label.
    expect(screen.getAllByText("Manual").length).toBeGreaterThanOrEqual(2);
  });

  it("links each row to its details page by clientId", () => {
    setupLedger();
    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: /SWIGGY/i })).toHaveAttribute(
      "href",
      "/transactions/c1",
    );
  });

  it("filters to automatic transactions", async () => {
    setupLedger();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "Automatic" }));
    expect(screen.getByText("SWIGGY")).toBeInTheDocument();
    expect(screen.queryByText("Aarav Patel")).not.toBeInTheDocument();
  });
});

describe("TransactionDetailsPage", () => {
  it("renders details for the transaction matched by clientId", () => {
    setupLedger();
    render(
      <MemoryRouter initialEntries={["/transactions/c1"]}>
        <Routes>
          <Route path="/transactions/:transactionId" element={<TransactionDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getAllByText("SWIGGY").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Money sent")).toBeInTheDocument();
    expect(screen.getByText(/Auto-detected/i)).toBeInTheDocument();
    expect(screen.getByText("Synced")).toBeInTheDocument();
  });

  it("shows income details for an inflow transaction", () => {
    setupLedger();
    render(
      <MemoryRouter initialEntries={["/transactions/c2"]}>
        <Routes>
          <Route path="/transactions/:transactionId" element={<TransactionDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getAllByText("Aarav Patel").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Money received")).toBeInTheDocument();
  });

  it("renders a not-found state for an unknown clientId", () => {
    setupLedger();
    render(
      <MemoryRouter initialEntries={["/transactions/nope"]}>
        <Routes>
          <Route path="/transactions/:transactionId" element={<TransactionDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText(/Transaction not found/i)).toBeInTheDocument();
  });
});
