/**
 * Minimal HTTP transport contract the sync client needs. Consumed by a thin
 * adapter in each host app (web's `ApiClient`, mobile's HTTP transport), so
 * the sync engine never depends on a concrete HTTP library.
 */
export type QueryValue = string | number | boolean | null | undefined;

export interface RemoteRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, QueryValue>;
  /** Mark a request as public (no auth header). */
  public?: boolean;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

/** A {path, options} -> response-data fire-and-forget request function. */
export type RemoteRequest = <T>(
  path: string,
  options?: RemoteRequestOptions,
) => Promise<T>;
