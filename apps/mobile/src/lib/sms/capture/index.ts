export * from "./types.js";
export * from "./bridge.js";
export * from "./capacitor-source.js";

import { SmsCaptureBridge } from "./bridge.js";
import { createNativeSource } from "./capacitor-source.js";

/** Default bridge wiring: the native (Capacitor) source only. The manual/paste
 *  path runs through the bridge's `ingestManual` / the SMS context ingest, so
 *  a browser with no native layer still works. */
export function createDefaultCaptureBridge(): SmsCaptureBridge {
  return new SmsCaptureBridge({ sources: [createNativeSource()] });
}
