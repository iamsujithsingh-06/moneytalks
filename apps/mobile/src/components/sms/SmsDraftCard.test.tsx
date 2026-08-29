import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SmsDraftCard } from "./SmsDraftCard.js";
import { draftRecord } from "./test-utils.js";

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
