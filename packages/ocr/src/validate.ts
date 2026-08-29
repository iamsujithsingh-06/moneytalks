/**
 * Image / input validation rules for smart capture (8.2, 8.3).
 *
 * Keeps raw images out of long-term storage: we validate type, size and
 * readability up front, and only the downscaled/compressed preview (for the
 * review UI) plus a content hash are ever retained. The original bytes are
 * discarded after extraction.
 */

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MIN_IMAGE_BYTES = 64; // reject empty/partial reads
export const MAX_PREVIEW_EDGE = 1600; // longest edge for the retained preview

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export interface ImageValidationError {
  code: "unsupported-format" | "oversized" | "unreadable" | "empty";
  message: string;
}

/** Validate an image's MIME + size. Returns null when acceptable. */
export function validateImage(input: {
  mimeType: string;
  size: number;
}): ImageValidationError | null {
  const mime = (input.mimeType ?? "").toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    return {
      code: "unsupported-format",
      message: "Only JPEG, PNG, WebP and HEIC receipts are supported.",
    };
  }
  if (input.size > MAX_IMAGE_BYTES) {
    return {
      code: "oversized",
      message: "That image is larger than 10 MB — please choose a smaller file.",
    };
  }
  if (input.size < MIN_IMAGE_BYTES) {
    return { code: "empty", message: "The image appears to be empty or unreadable." };
  }
  return null;
}

/** True when the filename/MIME indicates a decodable raster image. */
export function looksLikeImage(mimeType: string, name: string): boolean {
  const mime = (mimeType ?? "").toLowerCase();
  const file = (name ?? "").toLowerCase();
  return (
    ALLOWED_MIME.has(mime) ||
    /\.(jpe?g|png|webp|heic|heif)$/.test(file)
  );
}
