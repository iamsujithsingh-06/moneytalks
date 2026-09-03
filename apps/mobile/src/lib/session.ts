import { Preferences } from "@capacitor/preferences";
import { Capacitor } from "@capacitor/core";
import type { UserPublic } from "@moneytalks/types";

const ACCESS_KEY = "mt.accessToken";
const REFRESH_KEY = "mt.refreshToken";
const DEVICE_KEY = "mt.deviceId";
const USER_KEY = "mt.user";

/**
 * Session token storage.
 *
 * On Android/Capacitor the access/refresh tokens live in native SharedPreferences
 * (via the Capacitor Preferences plugin, which keys them under the app-scoped
 * native store) rather than the WebView's web localStorage. This keeps tokens out
 * of the WebView's extractable web storage, and the stores that contain them are
 * excluded from OS backup by `data_extraction_rules.xml` + `allowBackup=false`.
 *
 * The public API stays synchronous (as callers require) backed by an in-memory
 * cache. `hydrate()` must be awaited once at startup to populate the cache from
 * native storage; on the open web this is a no-op because the cache is already
 * seeded from localStorage. Writes are synchronous to cache and fire-and-forget
 * to the persistent backend so reads on the hot path never block.
 */

const isNative = Capacitor.isNativePlatform();

function webGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function webSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures; cache still holds the value for this session.
  }
}

function webRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}

/**
 * In-memory cache. On native it is populated by `hydrate()`; on the web it is
 * seeded directly from localStorage at construction so `load()` is synchronous.
 */
const cache: {
  accessToken: string | null;
  refreshToken: string | null;
  deviceId: string | null;
  user: UserPublic | null;
} = isNative
  ? { accessToken: null, refreshToken: null, deviceId: null, user: null }
  : {
      accessToken: webGet(ACCESS_KEY),
      refreshToken: webGet(REFRESH_KEY),
      deviceId: webGet(DEVICE_KEY),
      user: readJSON<UserPublic>(USER_KEY),
    };

function readJSON<T>(key: string): T | null {
  try {
    const raw = webGet(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export interface Session {
  accessToken: string | null;
  refreshToken: string | null;
  deviceId: string | null;
  user: UserPublic | null;
}

/** Populate the cache from persistent storage (native only; web is preseeded). */
async function hydrateNative(): Promise<void> {
  if (!isNative) return;
  const [at, rt, dev, user] = await Promise.all([
    Preferences.get({ key: ACCESS_KEY }),
    Preferences.get({ key: REFRESH_KEY }),
    Preferences.get({ key: DEVICE_KEY }),
    Preferences.get({ key: USER_KEY }),
  ]);
  cache.accessToken = at.value;
  cache.refreshToken = rt.value;
  cache.deviceId = dev.value;
  try {
    cache.user = user.value ? (JSON.parse(user.value) as UserPublic) : null;
  } catch {
    cache.user = null;
  }
}

async function nativeSet(key: string, value: string | null): Promise<void> {
  if (!isNative) return;
  try {
    if (value == null) {
      await Preferences.remove({ key });
    } else {
      await Preferences.set({ key, value });
    }
  } catch {
    // Best-effort persistence; cache is authoritative for the session.
  }
}

export const sessionStore = {
  load(): Session {
    return {
      accessToken: cache.accessToken,
      refreshToken: cache.refreshToken,
      deviceId: cache.deviceId,
      user: cache.user,
    };
  },

  /** Hydrate the in-memory cache from persistent storage. Call once on startup. */
  async hydrate(): Promise<void> {
    await hydrateNative();
  },

  setTokens(accessToken: string, refreshToken: string): void {
    cache.accessToken = accessToken;
    cache.refreshToken = refreshToken;
    if (!isNative) {
      webSet(ACCESS_KEY, accessToken);
      webSet(REFRESH_KEY, refreshToken);
    } else {
      void nativeSet(ACCESS_KEY, accessToken);
      void nativeSet(REFRESH_KEY, refreshToken);
    }
  },

  setAccessToken(accessToken: string): void {
    cache.accessToken = accessToken;
    if (!isNative) {
      webSet(ACCESS_KEY, accessToken);
    } else {
      void nativeSet(ACCESS_KEY, accessToken);
    }
  },

  setRefreshToken(refreshToken: string): void {
    cache.refreshToken = refreshToken;
    if (!isNative) {
      webSet(REFRESH_KEY, refreshToken);
    } else {
      void nativeSet(REFRESH_KEY, refreshToken);
    }
  },

  setDeviceId(deviceId: string): void {
    cache.deviceId = deviceId;
    if (!isNative) {
      webSet(DEVICE_KEY, deviceId);
    } else {
      void nativeSet(DEVICE_KEY, deviceId);
    }
  },

  setUser(user: UserPublic): void {
    cache.user = user;
    if (!isNative) {
      webSet(USER_KEY, JSON.stringify(user));
    } else {
      void nativeSet(USER_KEY, JSON.stringify(user));
    }
  },

  clear(): void {
    cache.accessToken = null;
    cache.refreshToken = null;
    cache.deviceId = null;
    cache.user = null;
    if (!isNative) {
      webRemove(ACCESS_KEY);
      webRemove(REFRESH_KEY);
      webRemove(DEVICE_KEY);
      webRemove(USER_KEY);
    } else {
      void nativeSet(ACCESS_KEY, null);
      void nativeSet(REFRESH_KEY, null);
      void nativeSet(DEVICE_KEY, null);
      void nativeSet(USER_KEY, null);
    }
  },
};
