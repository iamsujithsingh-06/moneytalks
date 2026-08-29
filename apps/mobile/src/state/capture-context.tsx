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

interface SmsCaptureContextValue {
  state: SmsCaptureBridgeState;
  /** The native source info, if one is configured. */
  native: SmsCaptureSourceInfo | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  refreshPermissions: () => Promise<void>;
  requestNativePermission: () => Promise<CapturePermission>;
  ingestManual: (message: SmsMessage) => Promise<IngestResult>;
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

  useEffect(() => {
    const bridgeInstance = bridgeRef.current;
    // Keep React state in sync with the bridge.
    const unsub = bridgeInstance.subscribe(setState);
    setState(bridgeInstance.getSnapshot());
    // Subscribe push sources while the app is mounted. Native receivers that
    // lack permission no-op; the manual path never depends on this.
    void bridgeInstance.start();
    return () => {
      unsub();
      void bridgeInstance.stop();
    };
  }, []);

  const start = useCallback(() => bridgeRef.current.start(), []);
  const stop = useCallback(() => bridgeRef.current.stop(), []);

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

  const ingestManual = useCallback(
    (message: SmsMessage) => bridgeRef.current.ingestManual(message),
    [],
  );

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
    }),
    [state, native, start, stop, refreshPermissions, requestNativePermission, ingestManual],
  );

  return <SmsCaptureContext.Provider value={value}>{children}</SmsCaptureContext.Provider>;
}
