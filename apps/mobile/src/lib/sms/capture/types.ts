import type { SmsMessage } from "@moneytalks/sms";

/**
 * Clean capture-provider boundary for SMS ingestion.
 *
 * The MoneyTalks SMS pipeline is local-first and native-capture oriented (see
 * ADR-005). A plain web PWA cannot read inbox SMS — its native bridge reuses
 * this same boundary: the UI depends only on `SmsCaptureSource`, never on a
 * platform API or Capacitor directly.
 */

export type CapturePermissionState =
  | "granted"
  | "denied"
  | "prompt"
  | "revoked"
  | "unsupported";

export type CaptureSourceKind = "native" | "manual";

export interface SmsCaptureSourceInfo {
  id: string;
  kind: CaptureSourceKind;
  label: string;
  /** Whether the source can capture in the current runtime. */
  available: boolean;
  /** Present when `available` is false — why capture is unavailable. */
  reason: string | null;
}

export interface CapturePermission {
  state: CapturePermissionState;
  /** Human-safe rationale shown in the UI (e.g. Play policy consent). */
  rationale?: string;
}

/** A single message captured by a source, forwarded into the pipeline. */
export interface SmsCaptureEvent {
  sourceId: string;
  message: SmsMessage;
}

export interface SmsCaptureSource {
  readonly info: SmsCaptureSourceInfo;
  getPermission(): Promise<CapturePermission>;
  requestPermission(): Promise<CapturePermission>;
  /**
   * Subscribe to captured messages. Returns an unsubscribe function.
   * The handler is called for every newly captured SMS while subscribed.
   */
  subscribe(handler: (message: SmsMessage) => void): () => void;
  /** Release any platform resources (e.g. stop the native receiver). */
  detach(): Promise<void>;
}
