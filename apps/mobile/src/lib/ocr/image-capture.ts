/**
 * Camera / gallery image capture for receipts (mobile web + Capacitor).
 *
 * Reads a `File` from an `<input type="file">`, validates it against the shared
 * OCR image rules, and produces a downscaled JPEG data-URL preview (longest
 * edge <= 1600px) plus the original bytes for content-hashing/dedup. The raw
 * bytes are only used to compute `imageHash`; the retained artifact is the
 * small preview, so original photos never sit in long-term storage.
 */

import { MAX_PREVIEW_EDGE, validateImage } from "@moneytalks/ocr";

export interface CapturedImage {
  /** Original decoded bytes, used only for hashing/dedup. */
  bytes: Uint8Array;
  /** Downscaled JPEG data-URL preview for the review UI. */
  previewUrl: string | null;
  mimeType: string;
  name: string;
  size: number;
}

export type CaptureImageResult =
  | { ok: true; image: CapturedImage }
  | { ok: false; reason: string };

/** Draw `file` into a JPEG data-URL no larger than MAX_PREVIEW_EDGE. */
async function makePreview(file: File): Promise<string | null> {
  let blobUrl: string | null = null;
  try {
    if (typeof Image === "undefined") return null;
    blobUrl = URL.createObjectURL(file);
    const img = await loadImage(blobUrl);
    const longestEdge = Math.max(img.naturalWidth, img.naturalHeight);
    if (longestEdge === 0) return null;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const scale = Math.min(1, MAX_PREVIEW_EDGE / longestEdge);
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image could not be decoded."));
    img.src = src;
  });
}

/** Validate + capture a picked image file. Always resolves; never throws. */
export async function captureImageFile(file: File): Promise<CaptureImageResult> {
  const err = validateImage({ mimeType: file.type, size: file.size });
  if (err) return { ok: false, reason: err.message };

  const bytes = await readBytes(file);
  if (bytes.length !== file.size) {
    return { ok: false, reason: "The image could not be read fully." };
  }

  // jsdom/headless runtimes may not implement image decoding or object URLs
  // (they throw "Not implemented"); the bytes are still captured and the
  // preview is simply omitted there.
  let previewUrl: string | null = null;
  try {
    if (typeof Image !== "undefined" && typeof URL.createObjectURL === "function") {
      previewUrl = await makePreview(file);
    }
  } catch {
    previewUrl = null;
  }

  return {
    ok: true,
    image: {
      bytes,
      previewUrl,
      mimeType: file.type,
      name: file.name,
      size: file.size,
    },
  };
}

/** Read a File's contents as a Uint8Array (FileReader, works in jsdom too). */
function readBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(new Error("The image could not be read."));
    reader.readAsArrayBuffer(file);
  });
}