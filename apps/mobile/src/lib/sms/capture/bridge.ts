import type { SmsMessage } from "@moneytalks/sms";
import { ingestSms, type IngestResult } from "../ingest.js";
import type {
  CapturePermission,
  CapturePermissionState,
  SmsCaptureSource,
  SmsCaptureSourceInfo,
} from "./types.js";

export interface SmsCaptureBridgeState {
  sources: SmsCaptureSourceInfo[];
  /** Permission state keyed by source id. */
  permissions: Record<string, CapturePermissionState>;
  /** True when the bridge is subscribed to push sources. */
  running: boolean;
  lastError: string | null;
}

type Listener = (state: SmsCaptureBridgeState) => void;

interface SmsCaptureBridgeOptions {
  sources: SmsCaptureSource[];
  /** Entry point into the local pipeline (defaults to `ingestSms`). */
  ingest?: (message: SmsMessage) => Promise<IngestResult>;
}

/**
 * Owns capture source selection and routes every captured message through the
 * existing parseSms -> ingest -> review pipeline. The UI depends on this
 * bridge (via the capture context), never on platform/Android APIs directly.
 */
export class SmsCaptureBridge {
  private readonly sources: SmsCaptureSource[];
  private readonly ingest: (message: SmsMessage) => Promise<IngestResult>;
  private readonly unsubscribes: Array<() => void> = [];
  private readonly listeners = new Set<Listener>();
  private running = false;

  constructor(opts: SmsCaptureBridgeOptions) {
    this.sources = opts.sources;
    this.ingest = opts.ingest ?? ingestSms;
  }

  getSnapshot(): SmsCaptureBridgeState {
    const permissions: Record<string, CapturePermissionState> = {};
    for (const s of this.sources) {
      permissions[s.info.id] = permissions[s.info.id] ?? "prompt";
    }
    return {
      sources: this.sources.map((s) => s.info),
      permissions,
      running: this.running,
      lastError: null,
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(partial?: Partial<SmsCaptureBridgeState>) {
    const next = { ...this.getSnapshot(), ...partial };
    for (const l of this.listeners) l(next);
  }

  /** Subscribe to every available push source. Idempotent. */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.emit({ running: true });
    for (const source of this.sources) {
      if (!source.info.available) continue;
      const unsub = source.subscribe((message) => {
        this.ingest(message).catch((err) => {
          this.emit({
            lastError: err instanceof Error ? err.message : "Failed to capture SMS.",
          });
        });
      });
      this.unsubscribes.push(unsub);
    }
  }

  /** Tear down all subscriptions (e.g. navigating away / logging out). */
  async stop(): Promise<void> {
    this.running = false;
    for (const unsub of this.unsubscribes) unsub();
    this.unsubscribes.length = 0;
    this.emit({ running: false });
  }

  async getPermission(sourceId: string): Promise<CapturePermission> {
    const source = this.sources.find((s) => s.info.id === sourceId);
    if (!source) return { state: "unsupported", rationale: "Unknown capture source." };
    const perm = await source.getPermission();
    this.emit({ permissions: { [sourceId]: perm.state } });
    return perm;
  }

  async requestPermission(sourceId: string): Promise<CapturePermission> {
    const source = this.sources.find((s) => s.info.id === sourceId);
    if (!source) return { state: "unsupported", rationale: "Unknown capture source." };
    const perm = await source.requestPermission();
    this.emit({ permissions: { [sourceId]: perm.state } });
    return perm;
  }

  /** Manual / paste fallback: run a message straight through the pipeline. */
  async ingestManual(message: SmsMessage): Promise<IngestResult> {
    return this.ingest(message);
  }

  /** Release native resources. */
  async detach(): Promise<void> {
    await this.stop();
    for (const source of this.sources) await source.detach().catch(() => undefined);
  }
}
