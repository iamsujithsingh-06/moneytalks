import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReceiptCaptureEntry } from "./ReceiptCaptureEntry.js";

const ingestMock = vi.fn<(input: unknown) => Promise<boolean>>();

vi.mock("../../state/ocr-context.js", () => ({
  useOcr: () => ({ ingest: ingestMock }),
}));

describe("ReceiptCaptureEntry", () => {
  beforeEach(() => {
    ingestMock.mockReset();
  });

  it("captures pasted receipt text through the ingestion boundary", async () => {
    ingestMock.mockResolvedValue(true);
    const user = userEvent.setup();
    render(<ReceiptCaptureEntry />);

    await user.click(screen.getByRole("button", { name: /add/i }));
    await user.type(
      screen.getByLabelText(/receipt text/i),
      "Cafe Zeta\nTOTAL  ₹540.00",
    );
    await user.click(screen.getByRole("button", { name: /parse & add to review/i }));

    expect(ingestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Cafe Zeta\nTOTAL  ₹540.00",
        mimeType: "text/plain",
      }),
    );
    expect(screen.getByText(/captured for review/i)).toBeInTheDocument();
  });

  it("shows a duplicate message when the receipt is already captured", async () => {
    ingestMock.mockResolvedValue(false);
    const user = userEvent.setup();
    render(<ReceiptCaptureEntry />);

    await user.click(screen.getByRole("button", { name: /add/i }));
    await user.type(screen.getByLabelText(/receipt text/i), "TOTAL  ₹540.00");
    await user.click(screen.getByRole("button", { name: /parse & add to review/i }));

    expect(screen.queryByText(/captured for review/i)).not.toBeInTheDocument();
    expect(ingestMock).toHaveBeenCalledTimes(1);
  });

  it("validates empty receipt text", async () => {
    const user = userEvent.setup();
    render(<ReceiptCaptureEntry />);

    await user.click(screen.getByRole("button", { name: /add/i }));
    await user.click(screen.getByRole("button", { name: /parse & add to review/i }));

    expect(screen.getByText(/paste some receipt text/i)).toBeInTheDocument();
    expect(ingestMock).not.toHaveBeenCalled();
  });
});
