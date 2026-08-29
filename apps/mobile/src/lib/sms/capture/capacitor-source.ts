import type { SmsMessage } from "@moneytalks/sms";
import type {
  CapturePermission,
  CapturePermissionState,
  SmsCaptureSource,
} from "./types.js";

/**
 * Native (Capacitor) capture source.
 *
 * A plain web PWA cannot read inbox SMS. This source is `available` only when
 * the app is running inside a Capacitor-capable native WebView that has the
 * `SmsCapture` plugin registered (see `native/android`). Otherwise it reports
 * `unsupported` and NEVER fabricates messages — the manual/paste fallback is
 * the supported path in a browser.
 */

type PluginState = "granted" | "denied" | "prompt" | "revoked";

interface SmsCapturePluginLike {
  requestPermission?: () => Promise<{ state: PluginState }>;
  getPermission?: () => Promise<{ state: PluginState }>;
  startCapture?: () => Promise<void>;
  stopCapture?: () => Promise<void>;
  addListener?: (
    eventName: string,
    fn: (data: { sender?: string | null; body?: string; receivedAt?: string | null }) => void,
  ) => Promise<{ remove: () => void }>;
}

interface CapacitorPluginRegistry {
  SmsCapture?: SmsCapturePluginLike;
}

interface CapacitorRuntimeLike {
  registerPlugin?(name: string): unknown;
  getPlatform?(): string;
  isNativePlatform?(): boolean;
  Plugins?: CapacitorPluginRegistry;
  plugin?(name: string): SmsCapturePluginLike | undefined;
}

type GlobalWithCapacitor = typeof globalThis & {
  Capacitor?: CapacitorRuntimeLike;
};

function getCapacitor(): CapacitorRuntimeLike | null {
  const g = globalThis as GlobalWithCapacitor;
  return g.Capacitor ?? null;
}

function resolvePlugin(): SmsCapturePluginLike | null {
  const cap = getCapacitor();
  if (!cap) return null;
  return cap.Plugins?.SmsCapture ?? cap.plugin?.("SmsCapture") ?? null;
}

function normalizeState(raw?: PluginState): CapturePermissionState {
  switch (raw) {
    case "granted":
    case "denied":
    case "revoked":
      return raw;
    default:
      return "prompt";
  }
}

export const UNSAFE_ENV_REASON =
  "This environment cannot read SMS messages. Run the Android build (Capacitor + SmsCapture plugin) to capture automatically, or paste the SMS manually below.";

export function isNativeCapable(): boolean {
  return Boolean(getCapacitor() && resolvePlugin());
}

export class CapacitorSmsCaptureSource implements SmsCaptureSource {
  readonly info = {
    id: "native",
    kind: "native" as const,
    label: "Auto-capture from messages",
    available: isNativeCapable(),
    reason: isNativeCapable() ? null : UNSAFE_ENV_REASON,
  };

  getPermission(): Promise<CapturePermission> {
    const plugin = resolvePlugin();
    if (!plugin?.getPermission) {
      return Promise.resolve({ state: "unsupported", rationale: this.info.reason ?? undefined });
    }
    return plugin
      .getPermission()
      .then((r) => ({ state: normalizeState(r.state) }))
      .catch(() => ({ state: "denied", rationale: "Could not read SMS permission state." }));
  }

  requestPermission(): Promise<CapturePermission> {
    const plugin = resolvePlugin();
    if (!plugin?.requestPermission) {
      return Promise.resolve({ state: "unsupported", rationale: this.info.reason ?? undefined });
    }
    return plugin
      .requestPermission()
      .then((r) => ({ state: normalizeState(r.state) }))
      .catch(() => ({ state: "denied", rationale: "SMS permission was denied or unavailable." }));
  }

  subscribe(handler: (message: SmsMessage) => void): () => void {
    const plugin = resolvePlugin();
    if (!plugin?.addListener) return () => undefined;

    let remove: (() => void) | undefined;
    void plugin
      .addListener("message", (data) => {
        if (!data.body) return;
        handler({
          sender: data.sender ?? null,
          body: data.body,
          receivedAt: data.receivedAt ?? new Date().toISOString(),
        });
      })
      .then((l) => {
        remove = l.remove;
      })
      .catch(() => undefined);

    // Ask the native receiver to begin pushing messages.
    void plugin.startCapture?.().catch(() => undefined);

    return () => {
      void plugin.stopCapture?.().catch(() => undefined);
      remove?.();
    };
  }

  async detach(): Promise<void> {
    const plugin = resolvePlugin();
    await plugin?.stopCapture?.().catch(() => undefined);
  }
}

export function createNativeSource(): CapacitorSmsCaptureSource {
  return new CapacitorSmsCaptureSource();
}
