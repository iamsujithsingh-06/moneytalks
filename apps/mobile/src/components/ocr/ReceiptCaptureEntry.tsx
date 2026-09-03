import { useRef, useState } from "react";
import { useOcr } from "../../state/ocr-context.js";
import { Button } from "../ui/Button.js";
import { CameraIcon, PasteIcon, ShieldIcon, XIcon } from "../ui/icons.js";
import { captureImageFile, type CapturedImage } from "../../lib/ocr/image-capture.js";

/**
 * Manual / photo capture for receipts.
 *
 * Capture boundary for two honest paths: a camera/gallery photo (real image
 * bytes + a downscaled preview) and pasted/typed receipt text. Both feed the
 * same `ocrContext.ingest` pipeline, which hashes the image for dedup and keeps
 * the raw bytes out of storage. Raw text stays on-device until confirmed.
 */
export function ReceiptCaptureEntry() {
  const { ingest } = useOcr();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<CapturedImage | null>(null);
  const [outcome, setOutcome] = useState<"idle" | "captured" | "duplicate" | "ignored">("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [captureCamera, setCaptureCamera] = useState(false);

  async function handlePhotoPick() {
    setCaptureCamera(true);
    fileRef.current?.click();
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const result = await captureImageFile(file);
      if (!result.ok) {
        setError(result.reason);
        setPhoto(null);
        return;
      }
      setPhoto(result.image);
      setOutcome("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that image.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit() {
    if (!photo && text.trim() === "") {
      setError("Add a photo or paste some receipt text to capture.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const captured = await ingest({
        text: text.trim(),
        bytes: photo?.bytes,
        mimeType: photo?.mimeType ?? "text/plain",
        name: photo?.name ?? "pasted-receipt",
        size: photo?.size ?? text.trim().length,
        previewUrl: photo?.previewUrl ?? undefined,
      });
      setOutcome(captured ? "captured" : "duplicate");
      setText("");
      setPhoto(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not capture receipt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-primary">
            <CameraIcon size={18} />
          </span>
          <div>
            <p className="text-sm font-semibold text-text-primary">Capture a receipt</p>
            <p className="text-xs text-text-muted">On-device only until you confirm.</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? "Close" : "Add"}
        </Button>
      </div>

      {outcome === "captured" ? (
        <p className="mt-3 rounded-lg bg-positive-soft/30 p-3 text-sm text-positive">
          Captured for review — confirm it below.
        </p>
      ) : null}

      {open ? (
        <form
          className="mt-4 grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              leftIcon={<CameraIcon size={16} />}
              onClick={() => void handlePhotoPick()}
              disabled={busy}
            >
              Photo
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              leftIcon={<PasteIcon size={16} />}
              onClick={() => {
                setCaptureCamera(false);
                fileRef.current?.click();
              }}
              disabled={busy}
            >
              Upload image
            </Button>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            capture={captureCamera ? "environment" : undefined}
            aria-label="Add a photo"
            className="hidden"
            onChange={(e) => void handleFileChange(e)}
          />

          {photo ? (
            <div className="flex items-center gap-3 rounded-lg border border-border-strong bg-field p-2">
              <span className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-md bg-white">
                {photo.previewUrl ? (
                  <img
                    src={photo.previewUrl}
                    alt="Receipt preview"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-text-muted">Preview</span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-primary">{photo.name}</p>
                <p className="text-xs text-text-muted">
                  {Math.round(photo.size / 1024)} KB · kept on-device
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove photo"
                onClick={() => setPhoto(null)}
              >
                <XIcon size={16} />
              </Button>
            </div>
          ) : null}

          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-text-secondary">Receipt text</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="Paste the receipt text or OCR output…"
              className="rounded-lg border border-border-strong bg-field px-3 py-2 text-base text-text-primary placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-[var(--mt-focus-ring)] focus-visible:outline-none"
            />
          </label>

          {error ? <p className="text-sm text-negative">{error}</p> : null}

          <Button type="submit" loading={busy} size="lg" fullWidth leftIcon={<PasteIcon size={16} />}>
            Parse & add to review
          </Button>

          <p className="flex items-center gap-1.5 text-xs text-text-muted">
            <ShieldIcon size={14} />
            Photos and raw text never leave your device unless you confirm them.
          </p>
        </form>
      ) : null}
    </div>
  );
}