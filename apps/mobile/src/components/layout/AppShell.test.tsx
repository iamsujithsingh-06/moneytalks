import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./AppShell.js";

vi.mock("../../state/sms-context.js", () => ({
  useSms: () => ({
    capturedCount: 3,
    pending: [],
    refresh: async () => undefined,
    ingest: async () => false,
    confirm: async () => false,
    reject: async () => undefined,
    ignore: async () => undefined,
    busy: false,
  }),
}));

vi.mock("../../state/ocr-context.js", () => ({
  useOcr: () => ({
    pending: [],
    capturedCount: 2,
    refresh: async () => undefined,
    ingest: async () => false,
    confirm: async () => false,
    reject: async () => undefined,
    ignore: async () => undefined,
    busy: false,
  }),
}));

function renderShell() {
  return render(
    <MemoryRouter initialEntries={["/home"]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/home" element={<div>home content</div>} />
          <Route path="/analysis" element={<div>analysis content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("AppShell nav", () => {
  it("links to the analysis page", () => {
    renderShell();
    const link = screen.getByRole("link", { name: /analysis/i });
    expect(link).toHaveAttribute("href", "/analysis");
  });

  it("opens /analysis when the Analysis item is tapped", () => {
    renderShell();
    fireEvent.click(screen.getByRole("link", { name: /analysis/i }));
    expect(screen.getByText("analysis content")).toBeInTheDocument();
  });

  it("links to the receipts review page", () => {
    renderShell();
    const link = screen.getByRole("link", { name: /receipts/i });
    expect(link).toHaveAttribute("href", "/receipts");
  });

  it("shows the OCR badge count on the Receipts item", () => {
    renderShell();
    const link = screen.getByRole("link", { name: /receipts/i });
    expect(link.textContent).toContain("2");
  });

  it("shows the SMS badge count on the Review item", () => {
    renderShell();
    const link = screen.getByRole("link", { name: /review/i });
    expect(link.textContent).toContain("3");
  });
});