import type { UserPublic } from "@moneytalks/types";

const ACCESS_KEY = "mt.accessToken";
const REFRESH_KEY = "mt.refreshToken";
const DEVICE_KEY = "mt.deviceId";
const USER_KEY = "mt.user";

function readJSON<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
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

export const sessionStore = {
  load(): Session {
    return {
      accessToken: window.localStorage.getItem(ACCESS_KEY),
      refreshToken: window.localStorage.getItem(REFRESH_KEY),
      deviceId: window.localStorage.getItem(DEVICE_KEY),
      user: readJSON<UserPublic>(USER_KEY),
    };
  },

  setTokens(accessToken: string, refreshToken: string): void {
    window.localStorage.setItem(ACCESS_KEY, accessToken);
    window.localStorage.setItem(REFRESH_KEY, refreshToken);
  },

  setAccessToken(accessToken: string): void {
    window.localStorage.setItem(ACCESS_KEY, accessToken);
  },

  setRefreshToken(refreshToken: string): void {
    window.localStorage.setItem(REFRESH_KEY, refreshToken);
  },

  setDeviceId(deviceId: string): void {
    window.localStorage.setItem(DEVICE_KEY, deviceId);
  },

  setUser(user: UserPublic): void {
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  clear(): void {
    window.localStorage.removeItem(ACCESS_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
    window.localStorage.removeItem(DEVICE_KEY);
    window.localStorage.removeItem(USER_KEY);
  },
};
