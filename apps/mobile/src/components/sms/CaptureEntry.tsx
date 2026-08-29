import { useState } from "react";
import { useSms } from "../../state/sms-context.js";
import { Button } from "../ui/Button.js";
import { PasteIcon, ShieldIcon } from "../ui/icons.js";

/**
 * Manual / paste capture fallback.
 *
 * This is intentionally NOT a fake "Web SMS Receiver" API. It is a stable
 * ingestion boundary: anything that can produce an `SmsMessage` (a native
 * Android receiver later, or a user pasting an SMS body here) feeds the same
 * `smsContext.ingest` pipeline. Raw bodies stay on-device until confirmed.
 */
export function CaptureEntry() {
  const { ingest } = useSms();
  const [open, setOpen] = useState(false);
  const [sender, setSender] = useState("");
  const [body, setBody] = useState("");
  const [outcome, setOutcome] = useState<"idle" | "captured" | "duplicate" | "ignored">("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    if (body.trim() === "") {
      setError("Paste an SMS body to capture.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const captured = await ingest({
        sender: sender.trim() === "" ? null : sender.trim(),
        body: body.trim(),
        receivedAt: new Date().toISOString(),
      });
      setOutcome(captured ? "captured" : "duplicate");
      setBody("");
      setSender("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not capture SMS.");
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
            <p className="text-sm font-semibold text-text-primary">Capture an SMS</p>
            <p className="text-xs text-text-muted">On-device only until you confirm.</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
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
            <span className="text-sm font-medium text-text-secondary">Sender</span>
            <input
              type="text"
              value={sender}
              onChange={(e) => setSender(e.target.value)}
              placeholder="e.g. VM-HDFCBK"
              className="h-12 rounded-lg border border-border-strong bg-field px-3 text-base text-text-primary placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-[var(--mt-focus-ring)] focus-visible:outline-none"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-text-secondary">Message body</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder="Paste the SMS you received…"
              className="rounded-lg border border-border-strong bg-field px-3 py-2 text-base text-text-primary placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-[var(--mt-focus-ring)] focus-visible:outline-none"
            />
          </label>

          {error ? <p className="text-sm text-negative">{error}</p> : null}

          <Button type="submit" loading={busy} size="lg" fullWidth leftIcon={<PasteIcon size={16} />}>
            Parse & add to review
          </Button>

          <p className="flex items-center gap-1.5 text-xs text-text-muted">
            <ShieldIcon size={14} />
            The raw message never leaves your device unless you confirm it.
          </p>
        </form>
      ) : null}
    </div>
  );
}
