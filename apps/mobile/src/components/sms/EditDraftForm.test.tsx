import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditDraftForm } from "./EditDraftForm.js";
import { draftRecord } from "./test-utils.js";

describe("EditDraftForm", () => {
  it("pre-populates parsed fields from the draft", () => {
    render(
      <EditDraftForm record={draftRecord()} onSave={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(screen.getByLabelText(/merchant/i)).toHaveValue("SWIGGY");
    expect(screen.getByLabelText(/amount \(inr\)/i)).toHaveValue("1234.5");
  });

  it("submits user edits (amount + merchant + type) on save", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <EditDraftForm record={draftRecord()} onSave={onSave} onCancel={vi.fn()} />,
    );

    await user.clear(screen.getByLabelText(/amount \(inr\)/i));
    await user.type(screen.getByLabelText(/amount \(inr\)/i), "99.5");
    await user.clear(screen.getByLabelText(/merchant/i));
    await user.type(screen.getByLabelText(/merchant/i), "ZOMATO");
    await user.click(screen.getByRole("radio", { name: "Income" }));
    await user.click(screen.getByRole("button", { name: /save & confirm/i }));

    expect(onSave).toHaveBeenCalledWith({
      type: "income",
      amountMinor: 9950,
      merchant: "ZOMATO",
      counterparty: null,
      transactionDate: "2026-05-25",
      paymentMethodKind: "upi",
      note: undefined,
    });
  });

  it("blocks save when the amount is invalid", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <EditDraftForm record={draftRecord()} onSave={onSave} onCancel={vi.fn()} />,
    );

    await user.clear(screen.getByLabelText(/amount \(inr\)/i));
    await user.type(screen.getByLabelText(/amount \(inr\)/i), "0");
    await user.click(screen.getByRole("button", { name: /save & confirm/i }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/enter a valid amount/i)).toBeInTheDocument();
  });

  it("calls onCancel", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<EditDraftForm record={draftRecord()} onSave={vi.fn()} onCancel={onCancel} />);

    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
