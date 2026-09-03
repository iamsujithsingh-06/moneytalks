import { describe, expect, it } from "vitest";
import { captureImageFile } from "./image-capture.js";

function tinyJpeg(name = "receipt.jpg"): File {
  const body = new Uint8Array(256);
  body[0] = 0xff;
  body[1] = 0xd8;
  return new File([body], name, { type: "image/jpeg" });
}

describe("captureImageFile", () => {
  it("returns the bytes, name and type for a valid image", async () => {
    const result = await captureImageFile(tinyJpeg());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.image.name).toBe("receipt.jpg");
    expect(result.image.mimeType).toBe("image/jpeg");
    expect(result.image.size).toBe(256);
    expect(result.image.bytes).toHaveLength(256);
    expect(result.image.bytes[0]).toBe(0xff);
    expect(result.image.bytes[1]).toBe(0xd8);
  });

  it("rejects an unsupported MIME type", async () => {
    const result = await captureImageFile(
      new File(["hello"], "receipt.pdf", { type: "application/pdf" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/only jpeg, png, webp and heic/i);
  });

  it("rejects an oversized image without reading it fully", async () => {
    const big = new Uint8Array(11 * 1024 * 1024);
    const result = await captureImageFile(new File([big], "big.png", { type: "image/png" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/larger than 10 mb/i);
  });
});