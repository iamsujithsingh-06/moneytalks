import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAll, offlineStore } from "@moneytalks/offline";
import { clearDrafts, listDrafts } from "../sms-store.js";
import {
  SmsCaptureBridge,
  CapacitorSmsCaptureSource,
  createDefaultCaptureBridge,
  UNSAFE_ENV_REASON,
  type SmsCaptureSource,
} from "./index.js";
import type { SmsMessage } from "@moneytalks/sms";

const UPI_DEBIT =
  "Rs.1,234.50 debited from A/c **5687 on 25-05-26 at SWIGGY. UPI Ref: 417281920347. Avl Bal Rs.50,000.00";

function sms(body: string, sender: string | null = "VM-HDFCBK"): SmsMessage {
  return { sender, body, receivedAt: "2026-05-25T09:30:00.000Z" };
}

function setupGlobalCapacitor(plugin: Record<string, unknown> | null) {
  const target = globalThis as Record<string, unknown>;
  if (plugin === null) {
    delete target.Capacitor;
    return;
  }
  target.Capacitor = { Plugins: { SmsCapture: plugin } };
}

function clearCapacitor() {
  setupGlobalCapacitor(null);
}

describe("SmsCaptureBridge", () => {
  beforeEach(async () => {
    clearCapacitor();
    await clearDrafts();
    await clearAll();
  });
  afterEach(() => clearCapacitor());

  it("reports the native source as unavailable in a plain (browser) runtime", () => {
    const bridge = new SmsCaptureBridge({ sources: [new CapacitorSmsCaptureSource()] });
    const state = bridge.getSnapshot();
    const native = state.sources[0]!;
    expect(native.available).toBe(false);
    expect(native.reason).toContain("cannot read SMS");
    expect(state.permissions[native.id]).toBe("prompt");
  });

  it("routes captured messages from a subscribed source through the pipeline", async () => {
    const source: SmsCaptureSource = {
      info: {
        id: "fake",
        kind: "native",
        label: "Fake",
        available: true,
        reason: null,
      },
      getPermission: async () => ({ state: "granted" }),
      requestPermission: async () => ({ state: "granted" }),
      subscribe: (h) => {
        Object.defineProperty(source, "push", { value: h, configurable: true });
        return () => undefined;
      },
      detach: async () => undefined,
    };

    const bridge = new SmsCaptureBridge({ sources: [source] });
    await bridge.start();

    (source as unknown as { push: (m: SmsMessage) => void }).push(sms(UPI_DEBIT));
    await vi.waitFor(async () => {
      expect((await offlineStore.list("transactions")).length).toBeGreaterThan(0);
    });

    // High-confidence messages are committed straight to the ledger (no review).
    expect(await listDrafts("pending")).toHaveLength(0);
    const txs = (await offlineStore.list("transactions")) as unknown as Array<{
      smsRef?: { upiRef?: string };
    }>;
    expect(txs[0]?.smsRef?.upiRef).toBe("417281920347");
    await bridge.stop();
  });

  it("subscribes a source that becomes available on a later start (app resume/reopen)", async () => {
    let available = false;
    let push: ((m: SmsMessage) => void) | null = null;
    const source = {
      get info() {
        return {
          id: "late",
          kind: "native" as const,
          label: "Late",
          available,
          reason: null,
        };
      },
      getPermission: async () => ({ state: "prompt" }),
      requestPermission: async () => ({ state: "prompt" }),
      subscribe: (h: (m: SmsMessage) => void) => {
        push = h;
        return () => undefined;
      },
      detach: async () => undefined,
    } as unknown as SmsCaptureSource;

    const bridge = new SmsCaptureBridge({ sources: [source] });
    await bridge.start();
    expect(push).toBeNull();

    // Simulate the Capacitor bridge/plugin proxy becoming ready, then a resume
    // re-driving start(): the now-available source must be subscribed.
    available = true;
    await bridge.start();
    expect(push).not.toBeNull();

    const pendingBefore = (await listDrafts("pending")).length;
    push!(sms(UPI_DEBIT));
    await vi.waitFor(async () => {
      expect((await offlineStore.list("transactions")).length).toBeGreaterThan(0);
    });
    // Auto-committed straight to the ledger; nothing left in review.
    expect(await listDrafts("pending")).toHaveLength(pendingBefore);
    await bridge.stop();
  });

  it("ingestManual runs a message through the pipeline (paste fallback)", async () => {
    const bridge = new SmsCaptureBridge({ sources: [] });
    const result = await bridge.ingestManual(sms(UPI_DEBIT));    expect(result.captured).toBe(true);
    expect(result.record.discipline).toBe("transaction");
  });

  it("injects a source reason into permissions when permission is unsupported", async () => {
    const source: SmsCaptureSource = {
      info: {
        id: "native",
        kind: "native",
        label: "Native",
        available: false,
        reason: "No native layer.",
      },
      getPermission: async () => ({ state: "unsupported" }),
      requestPermission: async () => ({ state: "unsupported" }),
      subscribe: () => () => undefined,
      detach: async () => undefined,
    };
    const bridge = new SmsCaptureBridge({ sources: [source] });
    const perm = await bridge.getPermission("native");
    expect(perm.state).toBe("unsupported");
  });
});

describe("CapacitorSmsCaptureSource", () => {
  beforeEach(() => clearCapacitor());
  afterEach(() => clearCapacitor());

  it("is unavailable and exposes a safe reason without a Capacitor runtime", async () => {
    const src = new CapacitorSmsCaptureSource();
    expect(src.info.available).toBe(false);
    expect(src.info.reason).toBe(UNSAFE_ENV_REASON);
    await expect(src.getPermission()).resolves.toEqual({
      state: "unsupported",
      rationale: UNSAFE_ENV_REASON,
    });
    await expect(src.requestPermission()).resolves.toEqual({
      state: "unsupported",
      rationale: UNSAFE_ENV_REASON,
    });
  });

  it("delegates permission and messages when the native plugin is present", async () => {
    const listeners: Array<(d: { body: string; sender?: string }) => void> = [];
    const plugin = {
      getPermission: vi.fn(async () => ({ state: "granted" })),
      requestPermission: vi.fn(async () => ({ state: "prompt" })),
      startCapture: vi.fn(async () => undefined),
      stopCapture: vi.fn(async () => undefined),
      addListener: vi.fn((_event: string, fn: (d: { body: string }) => void) => {
        listeners.push(fn);
        return { remove: vi.fn() };
      }),
    };
    setupGlobalCapacitor(plugin);

    const src = new CapacitorSmsCaptureSource();
    expect(src.info.available).toBe(true);
    expect(src.info.reason).toBeNull();

    await expect(src.getPermission()).resolves.toEqual({ state: "granted" });
    await expect(src.requestPermission()).resolves.toEqual({ state: "prompt" });

    const received: SmsMessage[] = [];
    const unsub = src.subscribe((m) => received.push(m));
    expect(listeners).toHaveLength(1);
    // `addListener` returns the listener handle synchronously, and
    // `startCapture` (which flushes queued messages) must run immediately after.
    expect(plugin.startCapture).toHaveBeenCalled();

    listeners[0]!({ body: UPI_DEBIT, sender: "VM-HDFCBK" });
    expect(received).toHaveLength(1);
    expect(received[0]!.body).toBe(UPI_DEBIT);
    expect(received[0]!.sender).toBe("VM-HDFCBK");

    unsub();
    expect(plugin.stopCapture).toHaveBeenCalled();
  });

  it("ignores messages with no body", async () => {
    const listeners: Array<(d: { body?: string }) => void> = [];
    setupGlobalCapacitor({
      addListener: (_e: string, fn: (d: { body?: string }) => void) => {
        listeners.push(fn);
        return { remove: () => undefined };
      },
    });
    const src = new CapacitorSmsCaptureSource();
    const received: SmsMessage[] = [];
    src.subscribe((m) => received.push(m));
    listeners[0]!({});
    expect(received).toHaveLength(0);
  });

  it("returns a no-op unsubscribe when no plugin is resolvable", () => {
    clearCapacitor();
    const src = new CapacitorSmsCaptureSource();
    const unsub = src.subscribe(() => undefined);
    expect(() => unsub()).not.toThrow();
  });

  it("passes through receivedAt from the native plugin and falls back to now when missing", async () => {
    const listeners: Array<(d: { body: string; sender?: string; receivedAt?: string }) => void> = [];
    setupGlobalCapacitor({
      addListener: (_e: string, fn: (d: { body: string; sender?: string; receivedAt?: string }) => void) => {
        listeners.push(fn);
        return { remove: () => undefined };
      },
      startCapture: async () => undefined,
    });

    const src = new CapacitorSmsCaptureSource();
    const received: SmsMessage[] = [];
    src.subscribe((m) => received.push(m));

    const nativeTs = "2026-08-15T10:30:00.000Z";
    listeners[0]!({ body: "Hello", sender: "+1", receivedAt: nativeTs });
    expect(received[0]!.receivedAt).toBe(nativeTs);

    listeners[0]!({ body: "No timestamp", sender: "+1" });
    expect(received[1]!.receivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("createDefaultCaptureBridge", () => {
  it("includes a native SmsCaptureSource with id 'native'", () => {
    clearCapacitor();
    const bridge = createDefaultCaptureBridge();
    const state = bridge.getSnapshot();
    expect(state.sources).toHaveLength(1);
    const native = state.sources[0]!;
    expect(native.id).toBe("native");
    expect(native.kind).toBe("native");
  });
});
