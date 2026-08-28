import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { DashboardSummary } from "@moneytalks/types";
import { DashboardPage } from "./DashboardPage.js";

const { summaryFn } = vi.hoisted(() => ({ summaryFn: vi.fn() }));

vi.mock("../lib/api/index.js", () => ({
  api: { dashboard: { summary: summaryFn } },
}));

const summary: DashboardSummary = {
  balance: 1234560,
  monthIncome: 2500000,
  monthExpense: 1500000,
  net: 1000000,
  topCategories: [
    { categoryId: "c1", name: "Food", totalMinor: 500000 },
    { categoryId: "c2", name: "Travel", totalMinor: 300000 },
  ],
  recent: [
    {
      id: "tx1",
      userId: "u1",
      clientId: "c1",
      type: "expense",
      direction: "outflow",
      source: "manual",
      status: "confirmed",
      amountMinor: -80000,
      currency: "INR",
      transactionDate: "2026-06-10T10:00:00.000Z",
      merchant: "Swiggy",
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
      createdAt: "2026-06-10T10:00:00.000Z",
      updatedAt: "2026-06-10T10:00:00.000Z",
      rev: 1,
    },
  ],
  budgets: [],
  goals: [],
  insights: [],
};

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

describe("DashboardPage", () => {
  beforeEach(() => {
    summaryFn.mockReset();
    summaryFn.mockResolvedValue(summary);
  });

  it("renders the balance hero and month stats", async () => {
    renderDashboard();
    expect(await screen.findByText("₹12,345.60")).toBeInTheDocument();
    expect(screen.getByText("Total balance")).toBeInTheDocument();
    expect(screen.getAllByText("Income").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Expenses")).toBeInTheDocument();
    expect(screen.getByText("Net flow")).toBeInTheDocument();
  });

  it("renders recent transactions", async () => {
    renderDashboard();
    expect(await screen.findByText("Swiggy")).toBeInTheDocument();
    expect(screen.getByText("Recent activity")).toBeInTheDocument();
  });

  it("renders top categories", async () => {
    renderDashboard();
    expect(await screen.findByText("Top categories")).toBeInTheDocument();
    expect(screen.getByText("Food")).toBeInTheDocument();
    expect(screen.getByText("Travel")).toBeInTheDocument();
  });

  it("shows an empty insights hint when there are no insights", async () => {
    renderDashboard();
    expect(await screen.findByText("Insights")).toBeInTheDocument();
  });
});
