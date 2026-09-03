import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReceiptCaptureEntry } from "./ReceiptCaptureEntry.js";
import type { CaptureImageResult } from "../../lib/ocr/image-capture.js";

const ingestMock = vi.fn<(input: {
  text: string;
  bytes?: Uint8Array;
  mimeType: string;
  name: string;
  size: number;
  previewUrl?: string;
}) => Promise<boolean>>();

vi.mock("../../state/ocr-context.js", () => ({
  useOcr: () => ({ ingest: ingestMock }),
}));

vi.mock("../../lib/ocr/image-capture.js", () => ({
  captureImageFile: (file: { type: string; name: string }) =>
    Promise.resolve({
      ok: true,
      image: {
        bytes: new Uint8Array([1, 2, 3]),
        previewUrl: "data:image/jpeg;base64,ZmFrZQ==",
        mimeType: file.type,
        name: file.name,
        size: 3,
      },
    }) as Promise<CaptureImageResult>,
}));

function makeFile(name = "receipt.jpg", type = "image/jpeg"): File {
  return new File([new Uint8Array(256)], name, { type });
}

function selectPhoto(input: HTMLInputElement, file: File): void {
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
}

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

  it("captures a photo plus text through the ingestion boundary with bytes + preview", async () => {
    ingestMock.mockResolvedValue(true);
    const user = userEvent.setup();
    render(<ReceiptCaptureEntry />);

    await user.click(screen.getByRole("button", { name: /add/i }));

    const input = screen.getByLabelText(/add a photo/i).closest("input")!;
    selectPhoto(input, makeFile());

    expect(await screen.findByText(/receipt\.jpg/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/receipt text/i), "Cafe Zeta\nTOTAL  ₹540.00");
    await user.click(screen.getByRole("button", { name: /parse & add to review/i }));

    expect(ingestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Cafe Zeta\nTOTAL  ₹540.00",
        bytes: new Uint8Array([1, 2, 3]),
        previewUrl: "data:image/jpeg;base64,ZmFrZQ==",
        mimeType: "image/jpeg",
        name: "receipt.jpg",
        size: 3,
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

  it("validates empty submission without a photo", async () => {
    const user = userEvent.setup();
    render(<ReceiptCaptureEntry />);

    await user.click(screen.getByRole("button", { name: /add/i }));
    await user.click(screen.getByRole("button", { name: /parse & add to review/i }));

    expect(screen.getByText(/add a photo or paste some receipt text/i)).toBeInTheDocument();
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it("allows removing the selected photo before submitting", async () => {
    ingestMock.mockResolvedValue(true);
    const user = userEvent.setup();
    render(<ReceiptCaptureEntry />);

    await user.click(screen.getByRole("button", { name: /add/i }));

    const input = screen.getByLabelText(/add a photo/i).closest("input")!;
    selectPhoto(input, makeFile());

    await user.click(await screen.findByRole("button", { name: /remove photo/i }));
    expect(screen.queryByText(/receipt\.jpg/i)).not.toBeInTheDocument();
  });
});