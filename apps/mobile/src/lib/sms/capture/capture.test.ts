import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAll } from "@moneytalks/offline";
import { clearDrafts, listDrafts } from "../sms-store.js";
import {
  SmsCaptureBridge,
  CapacitorSmsCaptureSource,
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

    const pendingBefore = (await listDrafts("pending")).length;
    (source as unknown as { push: (m: SmsMessage) => void }).push(sms(UPI_DEBIT));
    await vi.waitFor(async () => {
      expect((await listDrafts("pending")).length).toBe(pendingBefore + 1);
    });

    const list = await listDrafts("pending");
    expect(list[0]?.draft?.upiRef).toBe("417281920347");
    await bridge.stop();
  });

  it("ingestManual runs a message through the pipeline (paste fallback)", async () => {
    const bridge = new SmsCaptureBridge({ sources: [] });
    const result = await bridge.ingestManual(sms(UPI_DEBIT));
    expect(result.captured).toBe(true);
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
      addListener: vi.fn(async (_event: string, fn: (d: { body: string }) => void) => {
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
      addListener: async (_e: string, fn: (d: { body?: string }) => void) => {
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
});
