import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  CategoryPublic,
  PaymentMethodPublic,
  TransactionPublic,
} from "@moneytalks/types";
import { TransactionFormModal } from "./TransactionFormModal.js";

const {
  categoriesList,
  paymentMethodsList,
  offlineCreate,
  offlineUpdate,
  syncSpy,
} = vi.hoisted(() => ({
  categoriesList: vi.fn(),
  paymentMethodsList: vi.fn(),
  offlineCreate: vi.fn(),
  offlineUpdate: vi.fn(),
  syncSpy: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/offline/index.js", () => ({
  offlineStore: {
    list: vi.fn((entity: string) =>
      entity === "categories" ? categoriesList() : paymentMethodsList(),
    ),
    create: offlineCreate,
    update: offlineUpdate,
  },
  syncEngine: { sync: syncSpy },
}));

const cat: CategoryPublic = {
  id: "cat-1",
  userId: "u1",
  clientId: "c1",
  name: "Food",
  type: "expense",
  icon: null,
  color: null,
  parentId: null,
  sortOrder: 0,
  isPreset: true,
  isDefault: true,
  status: "active",
  deleted: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  rev: 1,
};

const method: PaymentMethodPublic = {
  id: "pm-1",
  userId: "u1",
  clientId: "c1",
  name: "Cash",
  kind: "wallet",
  provider: null,
  maskedNumber: null,
  accountRef: null,
  isDefault: false,
  status: "active",
  deleted: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  rev: 1,
};

describe("TransactionFormModal (add)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    categoriesList.mockResolvedValue([cat]);
    paymentMethodsList.mockResolvedValue([method]);
    offlineCreate.mockResolvedValue({ doc: { id: "tx-1" }, clientId: "abc" });
  });

  it("writes a new expense transaction to the offline store", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    const user = userEvent.setup();

    render(
      <TransactionFormModal open onClose={onClose} tx={null} onSaved={onSaved} />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^Amount/), "1234.50");
    await user.selectOptions(screen.getByLabelText(/^Category/), "cat-1");
    await user.click(screen.getByRole("button", { name: /add transaction/i }));

    await waitFor(() => {
      expect(offlineCreate).toHaveBeenCalledTimes(1);
    });
    const [entity, payload] = offlineCreate.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(entity).toBe("transactions");
    expect(payload.amountMinor).toBe(123450);
    expect(payload.type).toBe("expense");
    expect(payload.currency).toBe("INR");
    expect(payload.categoryId).toBe("cat-1");
    expect(payload.clientId).toBeTruthy();
    expect(payload.transactionDate).toBeTruthy();
    await waitFor(() => expect(syncSpy).toHaveBeenCalledWith("manual"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("does not submit when the amount is invalid", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    const user = userEvent.setup();

    render(
      <TransactionFormModal open onClose={onClose} tx={null} onSaved={onSaved} />,
    );

    await user.type(screen.getByLabelText(/^Amount/), "not-a-number");
    await user.click(screen.getByRole("button", { name: /add transaction/i }));

    await waitFor(() => {
      expect(offlineCreate).not.toHaveBeenCalled();
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("TransactionFormModal (edit)", () => {
  it("prefills the form and updates the offline store by clientId", async () => {
    const tx: TransactionPublic = {
      id: "tx-existing",
      userId: "u1",
      clientId: "c1",
      type: "expense",
      direction: "outflow",
      source: "manual",
      status: "confirmed",
      amountMinor: 99900,
      currency: "INR",
      transactionDate: "2026-05-20T00:00:00.000Z",
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
      createdAt: "2026-05-20T00:00:00.000Z",
      updatedAt: "2026-05-20T00:00:00.000Z",
      rev: 1,
    };
    offlineUpdate.mockResolvedValue({});
    const user = userEvent.setup();

    render(
      <TransactionFormModal open onClose={vi.fn()} tx={tx} onSaved={vi.fn()} />,
    );

    expect(screen.getByText("Edit transaction")).toBeInTheDocument();
    expect((screen.getByLabelText(/^Amount/) as HTMLInputElement).value).toBe(
      "999.00",
    );
    await user.clear(screen.getByLabelText(/^Amount/));
    await user.type(screen.getByLabelText(/^Amount/), "1000");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(offlineUpdate).toHaveBeenCalledWith("transactions", "c1", expect.any(Object));
    });
    const payload = offlineUpdate.mock.calls[0]![2] as { amountMinor: number };
    expect(payload.amountMinor).toBe(100000);
    await waitFor(() => expect(syncSpy).toHaveBeenCalledWith("manual"));
  });
});
