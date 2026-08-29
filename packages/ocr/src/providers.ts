/**
 * OcrProvider registry + built-in providers (ADR-006).
 *
 * Providers are environment-aware. In the current web build the only provider
 * that can actually run is `manual` (user pastes/enters receipt text); native
 * on-device ML Kit and cloud providers report `available:false` with a reason
 * rather than ever fabricating text. This keeps the pipeline provider-agnostic
 * and truthful about what the runtime can do.
 */

import type { OcrExtractionResult, OcrImage, OcrProvider } from "./types.js";

function ok(text: string, provider: string): OcrExtractionResult {
  return { outcome: "success", text, provider, reason: null };
}

function fail(code: "empty" | "unreadable" | "unsupported-image" | "ocr-failure", reason: string): OcrExtractionResult {
  return { outcome: "failure", text: null, provider: null, reason };
}

/** Manual/text-entry provider: user pastes or types receipt text. */
export const manualProvider: OcrProvider = {
  id: "manual",
  label: "Manual / pasted text",
  kind: "manual",
  available: true,
  reason: null,
  async extract(image: OcrImage): Promise<OcrExtractionResult> {
    const dataUrl = image.dataUrl ?? "";
    if (dataUrl.startsWith("data:text/plain,")) {
      const text = decodeURIComponent(dataUrl.slice("data:text/plain,".length));
      if (!text.trim()) return fail("empty", "No text was entered.");
      return ok(text.trim(), "manual");
    }
    return fail("unreadable", "No receipt text was provided to the manual entry provider.");
  },
};

/** Native on-device OCR. Unavailable in the web build — never fakes output. */
export const nativeProvider: OcrProvider = {
  id: "native",
  label: "On-device OCR (ML Kit)",
  kind: "native",
  available: false,
  reason: "On-device OCR requires a native mobile runtime and is not available here.",
  async extract(): Promise<OcrExtractionResult> {
    return fail("ocr-failure", nativeProvider.reason!);
  },
};

/** Cloud OCR adapter placeholder. Provider chosen at implementation time. */
export const cloudProvider: OcrProvider = {
  id: "cloud",
  label: "Cloud OCR",
  kind: "cloud",
  available: false,
  reason: "Cloud OCR is not configured in this build.",
  async extract(): Promise<OcrExtractionResult> {
    return fail("ocr-failure", cloudProvider.reason!);
  },
};

/** The providers this build exposes, in preferred order. */
export const OCR_PROVIDERS: OcrProvider[] = [
  nativeProvider,
  manualProvider,
  cloudProvider,
];

/** Resolve an available provider by id, else the first available one. */
export function resolveProvider(id?: string): OcrProvider {
  const byId = OCR_PROVIDERS.find((p) => p.id === id && p.available);
  if (byId) return byId;
  const first = OCR_PROVIDERS.find((p) => p.available);
  return first ?? manualProvider;
}

/** True when any provider can run in this runtime. */
export function hasAvailableProvider(): boolean {
  return OCR_PROVIDERS.some((p) => p.available);
}
