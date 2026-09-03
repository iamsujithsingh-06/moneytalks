# MoneyTalks SMS Capture — Native Android (Capacitor)

Per ADR-005, the **native Android layer owns inbox SMS capture**. The WebView PWA never reads
the inbox; it consumes a clean `SmsCaptureSource` boundary (see
`apps/mobile/src/lib/sms/capture/*`) that maps onto this plugin.

## How it is wired

This directory is a **pnpm workspace package** (`@moneytalks/sms-capacitor-android`), declared
in `pnpm-workspace.yaml` and listed as a dependency of `apps/mobile`. When you run:

```bash
pnpm install                       # links the workspace package
npx cap sync android               # discovers and registers the plugin
```

Capacitor's CLI reads the `capacitor` field in `package.json`, adds the module to
`android/capacitor.settings.gradle`, includes it as an `implementation project(...)`
dependency in `android/app/capacitor.build.gradle`, and merges the plugin's
`@CapacitorPlugin` classpath into `android/app/src/main/assets/capacitor.plugins.json`.
The app's merged manifest also picks up `RECEIVE_SMS` / `READ_SMS` permissions declared in
`src/main/AndroidManifest.xml`.

**Do not** manually edit `android/capacitor.settings.gradle` or
`android/app/capacitor.build.gradle` — they are overwritten on every `cap sync`.

## JS <-> native contract

| JS (bridge)                   | Native plugin method                | Notes                                                  |
| ----------------------------- | ----------------------------------- | ------------------------------------------------------ |
| `getPermission()`             | `SmsCapture.getPermission()`        | Returns `{ state: "granted" | "prompt" }`              |
| `requestPermission()`         | `SmsCapture.requestPermission()`    | In-app disclosure + Play justification required         |
| `start()` → `startCapture()`  | `SmsCapture.startCapture()`         | Retains the call, registers `SMS_RECEIVED` receiver     |
| `stop()` → `stopCapture()`    | `SmsCapture.stopCapture()`          | Unregisters the receiver                                |
| `addListener("message", fn)`  | async push events                   | `{ sender, body, receivedAt }`                          |

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

The plugin compiles inside the Capacitor-generated Android project. It targets
**compileSdk 36**, **minSdk 24**, **JDK 21** and depends on the app's
`:capacitor-android` project (not a standalone Maven artifact). The build uses
Kotlin 2.0.21 and `androidx.core` from the shell's `variables.gradle`.

To rebuild the app APK, run from `apps/mobile`:

```bash
npx cap sync android
cd android && ./gradlew assembleDebug
```

### Timestamp note

The plugin emits `receivedAt` as an ISO-8601 UTC string built with
`java.text.SimpleDateFormat` (not `java.time.Instant`) so the broadcast receiver
works without core-library desugaring on all devices ≥ API 24.
