import { useState } from "react";
import { useSmsCapture } from "../../state/capture-context.js";
import { Button } from "../ui/Button.js";
import { AlertIcon, ShieldIcon } from "../ui/icons.js";

/**
 * Surfaces the native auto-capture source (Capacitor + Android SmsReceive).
 *
 * In a plain web PWA there is no SMS-source, so this only ever shows an
 * informational note — it never fakes permission or capture. Manual capture
 * is handled separately by {@link CaptureEntry}.
 */
export function CapturePanel() {
  const { native, state, requestNativePermission, refreshPermissions } = useSmsCapture();
  const [busy, setBusy] = useState(false);

  if (!native) return null;

  // Native is available (Capacitor WebView): drive the permission flow.
  if (native.available) {
    const perm = state.permissions[native.id];
    if (perm === "granted") {
      return (
        <div className="flex items-start gap-3 rounded-xl border border-positive/40 bg-positive-soft/15 p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-positive-soft text-positive">
            <ShieldIcon size={18} />
          </span>
          <div>
            <p className="text-sm font-semibold text-text-primary">Auto-capture is on</p>
            <p className="text-sm text-text-muted">
              Messages will flow into your review queue without pasting them.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
            <ShieldIcon size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-primary">Capture messages automatically</p>
            <p className="text-sm text-text-muted">
              Allow MoneyTalks access to receive transaction messages so they appear here for
              review. You control every confirm.
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button
            size="sm"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await requestNativePermission();
                await refreshPermissions();
              } finally {
                setBusy(false);
              }
            }}
          >
            Allow access
          </Button>
          <span className="text-xs text-text-muted">
            {perm === "denied" || perm === "revoked"
              ? "Access was denied. You can still paste messages manually."
              : "You can still paste messages manually."}
          </span>
        </div>
      </div>
    );
  }

  // Native unavailable (browser / this build). Informational only.
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning">
        <AlertIcon size={18} />
      </span>
      <div>
        <p className="text-sm font-semibold text-text-primary">Automatic capture needs the app</p>
        <p className="text-sm text-text-muted">
          A browser PWA cannot read your messages. Use the Android build to capture automatically,
          or paste SMS below to keep going.
        </p>
      </div>
    </div>
  );
}
