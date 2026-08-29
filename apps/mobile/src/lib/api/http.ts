export interface ApiErrorDetail {
  field?: string;
  issue?: string;
  code?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: ApiErrorDetail[];
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;
  readonly requestId?: string;

  constructor(
    status: number,
    code: string,
    message: string,
    opts: {
      details?: ApiErrorDetail[];
      retryable?: boolean;
      retryAfterSeconds?: number;
      requestId?: string;
    } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = opts.details;
    this.retryable = opts.retryable ?? false;
    this.retryAfterSeconds = opts.retryAfterSeconds;
    this.requestId = opts.requestId;
  }
}

export interface ApiMeta {
  requestId?: string;
  [key: string]: unknown;
}

export type QueryValue = string | number | boolean | null | undefined;

export function buildQuery(
  params?: Record<string, QueryValue | QueryValue[]>,
): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== null && item !== undefined) search.append(key, String(item));
      }
    } else {
      search.append(key, String(value));
    }
  }
  const raw = search.toString();
  return raw ? `?${raw}` : "";
}

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  query?: Record<string, QueryValue | QueryValue[]>;
  signal?: AbortSignal;
  credentials?: boolean;
  /** Set to true to skip the automatic Authorization header (e.g. login/register). */
  public?: boolean;
}

export interface ResponseEnvelope<T> {
  data: T;
  meta: ApiMeta;
}

export class HttpTransport {
  constructor(
    readonly baseUrl: string,
    private readonly getToken: () => string | null,
  ) {}

  baseHeaders(): Record<string, string> {
    return { "Content-Type": "application/json" };
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { body, query, signal, public: isPublic } = options;
    const url = `${this.baseUrl}${path}${buildQuery(query)}`;

    const headers: Record<string, string> = {
      ...this.baseHeaders(),
      ...options.headers,
    };

    const token = this.getToken();
    if (token && !isPublic) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const init: RequestInit = {
      method: options.method ?? "GET",
      headers,
      signal,
    };

    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw err;
      }
      throw new ApiError(0, "NETWORK_ERROR", "Unable to reach the server.");
    }

    return this.handleResponse<T>(response);
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    const text = await response.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }

    if (!response.ok) {
      const error = (json as { error?: Record<string, unknown> })?.error ?? {};
      const code = (error.code as string) ?? "UNKNOWN_ERROR";
      const message =
        (error.message as string) ?? `Request failed with status ${response.status}.`;
      throw new ApiError(response.status, code, message, {
        details: error.details as ApiErrorDetail[] | undefined,
        retryable: error.retryable as boolean | undefined,
        retryAfterSeconds: error.retryAfterSeconds as number | undefined,
        requestId: error.requestId as string | undefined,
      });
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (json as ResponseEnvelope<T>)?.data ?? (json as T);
  }
}
