/**
 * On-device user preferences (localStorage). Kept minimal and non-secret;
 * credentials/tokens never live here.
 */

const TRACKING_KEY = "mt.settings.smsTracking";

export interface SmsTrackingSettings {
  /** Master switch for automatic SMS transaction capture. */
  automaticCaptureEnabled: boolean;
}

const DEFAULTS: SmsTrackingSettings = {
  automaticCaptureEnabled: true,
};

export function loadSettings(): SmsTrackingSettings {
  try {
    const raw = localStorage.getItem(TRACKING_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<SmsTrackingSettings>;
    return {
      automaticCaptureEnabled:
        typeof parsed.automaticCaptureEnabled === "boolean"
          ? parsed.automaticCaptureEnabled
          : DEFAULTS.automaticCaptureEnabled,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setAutomaticCaptureEnabled(enabled: boolean): void {
  const next = { ...loadSettings(), automaticCaptureEnabled: enabled };
  try {
    localStorage.setItem(TRACKING_KEY, JSON.stringify(next));
  } catch {
    // Storage may be unavailable (private mode) — the in-memory default still holds.
  }
}

export function trackingEnabled(): boolean {
  return loadSettings().automaticCaptureEnabled;
}
