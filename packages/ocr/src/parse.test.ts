import { describe, expect, it } from "vitest";
import { parseReceiptText } from "./parse.js";

describe("parseReceiptText", () => {
  it("parses a simple single-amount receipt", () => {
    const res = parseReceiptText([
      "The Little Bakery",
      "12/05/2026",
      "Croissant x2  240.00",
      "TOTAL  ₹240.00",
    ].join("\n"));

    expect(res.outcome).toBe("parsed");
    expect(res.draft).toBeTruthy();
    expect(res.draft!.amountMinor.value).toBe(24000);
    expect(res.draft!.merchant.value).toBe("The Little Bakery");
    expect(res.draft!.transactionDate.value).toBe("2026-05-12");
    expect(res.draft!.needsReview).toBe(false);
  });

  it("prefers a clearly-labelled TOTAL over other amounts", () => {
    const res = parseReceiptText([
      "Cafe Zeta",
      "Subtotal  500.00",
      "GST  90.00",
      "Discount  -50.00",
      "TOTAL  ₹540.00",
    ].join("\n"));

    expect(res.outcome).toBe("parsed");
    expect(res.draft!.amountMinor.value).toBe(54000);
    expect(res.draft!.subtotalMinor.value).toBe(50000);
    expect(res.draft!.taxMinor.value).toBe(9000);
  });

  it("flags ambiguity when multiple totals exist with no clear label", () => {
    const res = parseReceiptText([
      "Store X",
      "1,200.00",
      "2,350.00",
      "3,100.00",
    ].join("\n"));

    expect(res.outcome).toBe("ambiguous");
    expect(res.draft!.amountMinor.needsReview).toBe(true);
  });

  it("classifies a refund receipt as refund type", () => {
    const res = parseReceiptText([
      "RETURNS MART",
      "CREDIT MEMO",
      "Rupees two thousand only",
      "₹2,000.00",
    ].join("\n"));
    expect(res.draft!.type.value).toBe("refund");
  });

  it("parses an ISO-format date", () => {
    const res = parseReceiptText([
      "Vendor",
      "Date: 2026-08-14",
      "Total ₹99.00",
    ].join("\n"));
    expect(res.draft!.transactionDate.value).toBe("2026-08-14");
  });

  it("returns no-amount when nothing is parseable", () => {
    const res = parseReceiptText("just some random words, no numbers");
    expect(res.outcome).toBe("no-amount");
    expect(res.draft).toBeNull();
  });

  it("returns empty for blank text", () => {
    const res = parseReceiptText("   ");
    expect(res.outcome).toBe("empty");
  });

  it("detects a UPI payment method from text hints", () => {
    const res = parseReceiptText([
      "Foodie",
      "Paid via UPI",
      "TOTAL  ₹450.00",
    ].join("\n"));
    expect(res.draft!.paymentMethod.value).toBe("upi");
  });

  it("extracts line items", () => {
    const res = parseReceiptText([
      "Mart",
      "Milk 1L  55.00",
      "Bread  40.00",
      "TOTAL  ₹95.00",
    ].join("\n"));
    expect(res.draft!.lineItems.length).toBe(2);
    expect(res.draft!.lineItems[0]!.description).toBe("Milk 1L");
  });

  it("regression: bare TOTAL with currency is treated as the total", () => {
    const res = parseReceiptText(["Shop", "TOTAL ₹540"].join("\n"));
    expect(res.outcome).toBe("parsed");
    expect(res.draft!.amountMinor.value).toBe(54000);
  });

  it("regression: Subtotal is NOT treated as the total", () => {
    // With a subtotal + discount but no clearly-labelled TOTAL, the engine must
    // NOT silently pick the subtotal as the payable total — it goes ambiguous.
    const res = parseReceiptText([
      "Shop",
      "Subtotal ₹500",
      "Discount -₹50",
    ].join("\n"));
    expect(res.outcome).toBe("ambiguous");
    expect(res.draft!.amountMinor.needsReview).toBe(true);
  });

  it("regression: Grand Total is treated as the total", () => {
    const res = parseReceiptText(["Shop", "Grand Total ₹540"].join("\n"));
    expect(res.outcome).toBe("parsed");
    expect(res.draft!.amountMinor.value).toBe(54000);
  });

  it("regression: TOTAL wins over subtotal/tax/discount on the same receipt", () => {
    const res = parseReceiptText([
      "Cafe Zeta",
      "Subtotal  500.00",
      "GST  90.00",
      "Discount  -50.00",
      "TOTAL  ₹540.00",
    ].join("\n"));
    expect(res.outcome).toBe("parsed");
    expect(res.draft!.amountMinor.value).toBe(54000);
    expect(res.draft!.subtotalMinor.value).toBe(50000);
    expect(res.draft!.taxMinor.value).toBe(9000);
    expect(res.draft!.discountMinor.value).toBe(5000);
  });
});
