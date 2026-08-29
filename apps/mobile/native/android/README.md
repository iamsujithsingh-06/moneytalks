# MoneyTalks SMS Capture — Native Android (Capacitor)

Per ADR-005, the **native Android layer owns inbox SMS capture**. The WebView PWA never reads
the inbox; it consumes a clean `SmsCaptureSource` boundary (see
`apps/mobile/src/lib/sms/capture/*`) that maps onto this plugin.

This directory is **Gradle-independent scaffolding** — it is not built by the pnpm workspace
graph. It is the packaged source you wire into the Capacitor-generated Android project when you
run `npx cap add android` in the mobile app.

## JS <-> native contract

| JS (bridge)                | Native plugin method          | Notes                                             |
| -------------------------- | ----------------------------- | ------------------------------------------------- |
| `getPermission()`          | `SmsCapture.getPermission()`  | Returns `{ state: "granted" \| "prompt" }`        |
| `requestPermission()`      | `SmsCapture.requestPermission()` | In-app disclosure + Play justification required |
| `start()` -> `startCapture()` | `SmsCapture.startCapture()`  | Retains the call, registers `SMS_RECEIVED` receiver |
| `stop()` -> `stopCapture()`   | `SmsCapture.stopCapture()`    | Unregisters the receiver                          |
| `addListener("message", fn)` | async push events             | `{ sender, body, receivedAt }`                    |

## JS wiring

`apps/mobile/src/lib/sms/capture/capacitor-source.ts` detects `window.Capacitor` +
`Capacitor.Plugins.SmsCapture`. When present it is `available`; otherwise it reports
`unsupported` and the UI falls back to the manual/paste `CaptureEntry`. It never fabricates
messages.

## Privacy

- `RECEIVE_SMS` is requested only through an in-app disclosure with Play-policy justification.
- Raw SMS bodies live on-device; only extracted, confirmed transaction fields sync.
- Permission revocation: on `stopCapture`/`detach` the receiver is unregistered; the JS
  `getPermission` reports the real OS state on the next review.

## Build

Standalone (when scaffolding the Android shell):

```bash
# inside the generated Capacitor android/ module, register the plugin:
#   include ':moneytalks-sms-capacitor'
#   project(':moneytalks-sms-capacitor').projectDir = new File('<path>/native/android')
```

Manifest permissions (`RECEIVE_SMS`, `READ_SMS`) and the Capacitor `SmsCapture` registration are
declared in `src/main/AndroidManifest.xml` and `capacitor.plugin.json`.
