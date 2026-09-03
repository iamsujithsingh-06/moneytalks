import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SmsDraftCard } from "./SmsDraftCard.js";
import { draftRecord } from "./test-utils.js";
import type { SmsDraftRecord } from "../../lib/sms/sms-store.js";

describe("SmsDraftCard", () => {
  it("renders merchant, signed amount, and type badge", () => {
    render(
      <SmsDraftCard
        record={draftRecord()}
        onEdit={vi.fn()}
        onConfirm={vi.fn()}
        onReject={vi.fn()}
      />,
    );

    expect(screen.getByText("SWIGGY")).toBeInTheDocument();
    // Signed negative for an expense (renders −₹1,234.50).
    expect(screen.getByText(/₹1,234\.50/)).toBeInTheDocument();
    expect(screen.getByText("Expense")).toBeInTheDocument();
    expect(screen.getByText("UPI")).toBeInTheDocument();
  });

  it("flags ambiguous drafts as 'Review required'", () => {
    render(
      <SmsDraftCard
        record={draftRecord({ discipline: "ambiguous" })}
        onEdit={vi.fn()}
        onConfirm={vi.fn()}
        onReject={vi.fn()}
      />,
    );

    expect(screen.getByText("Review required")).toBeInTheDocument();
  });

  it("shows the RRN when a reference is present", () => {
    render(
      <SmsDraftCard
        record={draftRecord()}
        onEdit={vi.fn()}
        onConfirm={vi.fn()}
        onReject={vi.fn()}
      />,
    );

    expect(screen.getByText("RRN 417281920347")).toBeInTheDocument();
  });

  it("renders an incoming credit once with sender, +amount, date, and RRN", () => {
    const income: SmsDraftRecord = {
      ...draftRecord(),
      id: "draft-income",
      discipline: "transaction",
      draft: {
        amountMinor: 500,
        currency: "INR",
        type: "income",
        merchant: null,
        counterparty: "Mr R THARUN KUMAR",
        transactionDate: "2026-08-15T10:30:00.000Z",
        accountRef: null,
        upiRef: "414287182659",
        bankRef: null,
        paymentMethodKind: "upi",
        bankSource: "hdfc",
        messageHash: "hash-2",
        confidence: 0.9,
        provider: "generic",
      },
    };

    render(
      <SmsDraftCard
        record={income}
        onEdit={vi.fn()}
        onConfirm={vi.fn()}
        onReject={vi.fn()}
      />,
    );

    // getByText throws if the sender name is rendered more than once.
    expect(screen.getByText("Mr R THARUN KUMAR")).toBeInTheDocument();
    expect(screen.getByText("Income")).toBeInTheDocument();
    expect(screen.getByText("+₹5.00")).toBeInTheDocument();
    expect(screen.getByText("15 Aug 2026")).toBeInTheDocument();
    expect(screen.getByText("RRN 414287182659")).toBeInTheDocument();
  });

  it("invokes handlers on edit / confirm / dismiss", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onConfirm = vi.fn();
    const onReject = vi.fn();
    const record = draftRecord();

    render(
      <SmsDraftCard
        record={record}
        onEdit={onEdit}
        onConfirm={onConfirm}
        onReject={onReject}
      />,
    );

    await user.click(screen.getByRole("button", { name: /edit swiggy draft/i }));
    expect(onEdit).toHaveBeenCalledWith(record);

    await user.click(screen.getByRole("button", { name: /confirm swiggy/i }));
    expect(onConfirm).toHaveBeenCalledWith(record);

    await user.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(onReject).toHaveBeenCalledWith(record.id);
  });
});
