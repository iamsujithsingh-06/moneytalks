import type {
  LoginResponse,
  RefreshResponse,
  UserPublic,
} from "@moneytalks/types";
import { ApiError, HttpTransport, type QueryValue, type RequestOptions } from "./http.js";
import { sessionStore } from "../session.js";

const REFRESHABLE = new Set([
  "TOKEN_EXPIRED",
  "TOKEN_REVOKED",
  "DEVICE_REVOKED",
  "UNAUTHORIZED",
]);

export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (import.meta.env.DEV ? "http://localhost:3000/api/v1" : "/api/v1");

/**
 * Defense-in-depth: never transmit authentication tokens or financial data over
 * plain HTTP in a production build. A relative "/api/v1" (same-origin) and
 * http://localhost (dev tools) are allowed; any other cleartext URL is rejected
 * so the app fails closed instead of leaking over the wire.
 */
export function assertSecureApiBase(baseUrl: string, isProd: boolean): void {
  if (isProd && /^http:\/\//i.test(baseUrl)) {
    throw new Error(
      "Refusing to run production MoneyTalks against an insecure HTTP API base URL. " +
        "Set VITE_API_BASE_URL to an HTTPS endpoint.",
    );
  }
}

assertSecureApiBase(API_BASE_URL, Boolean(import.meta.env.PROD));

export interface AuthApi {
  register(input: RegisterInput): Promise<{ userId: string; emailVerified: boolean }>;
  login(input: LoginInput): Promise<LoginResponse>;
  refresh(refreshToken: string): Promise<RefreshResponse>;
  logout(deviceId: string): Promise<void>;
  logoutAll(): Promise<void>;
  me(): Promise<{ user: UserPublic }>;
}

export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export class ApiClient {
  readonly transport: HttpTransport;
  private refreshing: Promise<boolean> | null = null;

  constructor() {
    this.transport = new HttpTransport(API_BASE_URL, () =>
      sessionStore.load().accessToken,
    );
  }

  private currentRefreshToken(): string | null {
    return sessionStore.load().refreshToken;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    try {
      return await this.transport.request<T>(path, options);
    } catch (err) {
      if (
        this.currentRefreshToken() &&
        err instanceof ApiError &&
        REFRESHABLE.has(err.code) &&
        !options.public
      ) {
        const refreshed = await this.refresh();
        if (refreshed) {
          return this.transport.request<T>(path, options);
        }
      }
      throw err;
    }
  }

  private refresh(): Promise<boolean> {
    if (!this.refreshing) {
      this.refreshing = this.doRefresh().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  private async doRefresh(): Promise<boolean> {
    const refreshToken = this.currentRefreshToken();
    if (!refreshToken) return false;
    try {
      const response = await this.transport.request<RefreshResponse>("/auth/refresh", {
        method: "POST",
        body: { refreshToken },
        public: true,
      });
      sessionStore.setTokens(response.accessToken, response.refreshToken);
      return true;
    } catch {
      sessionStore.clear();
      return false;
    }
  }

  readonly auth: AuthApi = {
    register: (input) =>
      this.request("/auth/register", { method: "POST", body: input, public: true }),
    login: (input) =>
      this.request("/auth/login", { method: "POST", body: input, public: true }),
    refresh: (refreshToken) =>
      this.request("/auth/refresh", {
        method: "POST",
        body: { refreshToken },
        public: true,
      }),
    logout: (deviceId) =>
      this.request("/auth/logout", { method: "POST", body: { deviceId } }),
    logoutAll: () => this.request("/auth/logout-all", { method: "POST" }),
    me: () => this.request("/auth/me"),
  };
}

export type { QueryValue };
export type { RequestOptions };
