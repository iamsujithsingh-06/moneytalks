import { useState } from "react";
import { useOcr } from "../../state/ocr-context.js";
import { Button } from "../ui/Button.js";
import { PasteIcon, ShieldIcon } from "../ui/icons.js";

/**
 * Manual / paste capture for receipts.
 *
 * This is deliberately NOT a fake "Web camera OCR" API. It is a stable capture
 * boundary: anything that can produce receipt text (an on-device OCR provider
 * later, or a user pasting receipt text here) feeds the same `ocrContext.ingest`
 * pipeline. Raw text stays on-device until confirmed.
 */
export function ReceiptCaptureEntry() {
  const { ingest } = useOcr();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [outcome, setOutcome] = useState<"idle" | "captured" | "duplicate" | "ignored">("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    if (text.trim() === "") {
      setError("Paste some receipt text to capture.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const captured = await ingest({
        text: text.trim(),
        mimeType: "text/plain",
        name: "pasted-receipt",
        size: text.trim().length,
      });
      setOutcome(captured ? "captured" : "duplicate");
      setText("");
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
            <PasteIcon size={18} />
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
            The raw text never leaves your device unless you confirm it.
          </p>
        </form>
      ) : null}
    </div>
  );
}
