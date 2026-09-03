import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SmsMessage } from "@moneytalks/sms";
import {
  createDefaultCaptureBridge,
  SmsCaptureBridge,
  type CapturePermission,
  type SmsCaptureBridgeState,
  type SmsCaptureSourceInfo,
} from "../lib/sms/capture/index.js";
import type { IngestResult } from "../lib/sms/ingest.js";
import {
  setAutomaticCaptureEnabled,
  trackingEnabled,
} from "../lib/settings.js";

interface SmsCaptureContextValue {
  state: SmsCaptureBridgeState;
  /** The native source info, if one is configured. */
  native: SmsCaptureSourceInfo | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  refreshPermissions: () => Promise<void>;
  requestNativePermission: () => Promise<CapturePermission>;
  ingestManual: (message: SmsMessage) => Promise<IngestResult>;
  /** Master switch for automatic capture. */
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

const SmsCaptureContext = createContext<SmsCaptureContextValue | null>(null);

export function useSmsCapture(): SmsCaptureContextValue {
  const ctx = useContext(SmsCaptureContext);
  if (!ctx) throw new Error("useSmsCapture must be used within SmsCaptureProvider");
  return ctx;
}

export function SmsCaptureProvider({
  children,
  bridge,
}: {
  children: ReactNode;
  bridge?: SmsCaptureBridge;
}) {
  const bridgeRef = useRef<SmsCaptureBridge>(bridge ?? createDefaultCaptureBridge());
  const [state, setState] = useState<SmsCaptureBridgeState>(
    () => bridgeRef.current.getSnapshot(),
  );
  const [enabled, setEnabledState] = useState<boolean>(() => trackingEnabled());

  const refreshPermissions = useCallback(async () => {
    for (const source of bridgeRef.current.getSnapshot().sources) {
      await bridgeRef.current.getPermission(source.id);
    }
  }, []);

  const requestNativePermission = useCallback(async () => {
    const nativeId = bridgeRef.current
      .getSnapshot()
      .sources.find((s) => s.kind === "native")?.id;
    if (!nativeId) return { state: "unsupported" as const };
    return bridgeRef.current.requestPermission(nativeId);
  }, []);

  useEffect(() => {
    const bridgeInstance = bridgeRef.current;
    // Keep React state in sync with the bridge.
    const unsub = bridgeInstance.subscribe(setState);
    setState(bridgeInstance.getSnapshot());
    // Subscribe push sources while the app is mounted (only when tracking is
    // enabled). Native receivers that lack permission no-op.
    if (enabled) {
      void bridgeInstance.start();
    }
    return () => {
      unsub();
      void bridgeInstance.stop();
    };
  }, [enabled]);

  // Reflect Android's real SMS permission state (never a stored flag): refresh
  // on mount and whenever the app returns to the foreground so a revoked
  // permission correctly shows "Allow" again and a granted one never does.
  useEffect(() => {
    if (!enabled) return;
    void refreshPermissions();
  }, [enabled, refreshPermissions]);

  useEffect(() => {
    if (!enabled) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshPermissions();
        // Re-drive start(): idempotent, and subscribes/flushes a source that
        // became available after the bridge finished injecting `window.Capacitor`
        // (e.g. on relaunch/resume, so queued SMS are drained into the pipeline).
        void bridgeRef.current.start();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [enabled, refreshPermissions]);

  const start = useCallback(() => bridgeRef.current.start(), []);
  const stop = useCallback(() => bridgeRef.current.stop(), []);

  const ingestManual = useCallback(
    (message: SmsMessage) => bridgeRef.current.ingestManual(message),
    [],
  );

  const setEnabled = useCallback((value: boolean) => {
    setAutomaticCaptureEnabled(value);
    setEnabledState(value);
  }, []);

  const native = useMemo(
    () => state.sources.find((s) => s.kind === "native") ?? null,
    [state.sources],
  );

  const value = useMemo<SmsCaptureContextValue>(
    () => ({
      state,
      native,
      start,
      stop,
      refreshPermissions,
      requestNativePermission,
      ingestManual,
      enabled,
      setEnabled,
    }),
    [
      state,
      native,
      start,
      stop,
      refreshPermissions,
      requestNativePermission,
      ingestManual,
      enabled,
      setEnabled,
    ],
  );

  return <SmsCaptureContext.Provider value={value}>{children}</SmsCaptureContext.Provider>;
}
