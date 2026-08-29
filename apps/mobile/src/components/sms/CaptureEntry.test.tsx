import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CaptureEntry } from "./CaptureEntry.js";

const ingestMock = vi.fn<(m: unknown) => Promise<boolean>>();

vi.mock("../../state/sms-context.js", () => ({
  useSms: () => ({ ingest: ingestMock }),
}));

describe("CaptureEntry", () => {
  beforeEach(() => {
    ingestMock.mockReset();
  });

  it("captures a pasted SMS body through the ingestion boundary", async () => {
    ingestMock.mockResolvedValue(true);
    const user = userEvent.setup();
    render(<CaptureEntry />);

    await user.click(screen.getByRole("button", { name: /add/i }));
    await user.type(screen.getByLabelText(/sender/i), "VM-HDFCBK");
    await user.type(
      screen.getByLabelText(/message body/i),
      "Rs.500 debited from A/c **1234",
    );
    await user.click(screen.getByRole("button", { name: /parse & add to review/i }));

    expect(ingestMock).toHaveBeenCalledWith({
      sender: "VM-HDFCBK",
      body: "Rs.500 debited from A/c **1234",
      receivedAt: expect.any(String),
    });
    expect(screen.getByText(/captured for review/i)).toBeInTheDocument();
  });

  it("shows a duplicate message when the message is already captured", async () => {
    ingestMock.mockResolvedValue(false);
    const user = userEvent.setup();
    render(<CaptureEntry />);

    await user.click(screen.getByRole("button", { name: /add/i }));
    await user.type(screen.getByLabelText(/message body/i), "Rs.500 debited");
    await user.click(screen.getByRole("button", { name: /parse & add to review/i }));

    expect(screen.queryByText(/captured for review/i)).not.toBeInTheDocument();
    expect(ingestMock).toHaveBeenCalledTimes(1);
  });

  it("validates an empty body", async () => {
    const user = userEvent.setup();
    render(<CaptureEntry />);

    await user.click(screen.getByRole("button", { name: /add/i }));
    await user.click(screen.getByRole("button", { name: /parse & add to review/i }));

    expect(screen.getByText(/paste an sms body/i)).toBeInTheDocument();
    expect(ingestMock).not.toHaveBeenCalled();
  });
});
