import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Money } from "./Money.js";

describe("Money", () => {
  it("renders a formatted positive amount", () => {
    render(<Money amountMinor={1234500} currency="INR" />);
    expect(screen.getByText("₹12,345.00")).toBeInTheDocument();
  });

  it("renders a negative amount in negative tone", () => {
    render(<Money amountMinor={-100} currency="INR" />);
    const el = screen.getByText("−₹1.00");
    expect(el).toBeInTheDocument();
    expect(el.className).toContain("text-negative");
  });

  it("renders an explicit sign when signed is true", () => {
    render(<Money amountMinor={100} currency="INR" signed />);
    expect(screen.getByText("+₹1.00")).toBeInTheDocument();
  });

  it("renders a +/- icon when withIcon and signed are true", () => {
    const { container } = render(
      <Money amountMinor={100} currency="INR" signed withIcon />,
    );
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("does not render an icon when signed is false", () => {
    const { container } = render(
      <Money amountMinor={100} currency="INR" withIcon />,
    );
    expect(container.querySelector("svg")).toBeNull();
  });

  it("applies an explicit positive tone override", () => {
    render(<Money amountMinor={100} currency="INR" tone="positive" />);
    expect(screen.getByText("₹1.00").className).toContain("text-positive");
  });
});
